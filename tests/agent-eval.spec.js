// @ts-check
/*
* Runs the SEAD agent's evaluation questions through the real chatbox, against a running
* stack, and records what happened: each turn's timing (time in the agent service versus
* time the browser spent running actions), the actions, the reply, and the interface state
* afterwards. The questions and the grader live with the agent, in
* sead_agent/evals/ of the deployment repository.
*
* It talks to the real language model, so it only runs when asked:
*
*   AGENT_EVAL=1 npx playwright test tests/agent-eval.spec.js --project=chromium --workers=1
*
* AGENT_EVAL_ONLY=id1,id2 runs a subset; AGENT_EVAL_LABEL names the results file.
*/
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const casesFile = process.env.AGENT_EVAL_CASES || path.resolve(__dirname, '../../sead_agent/evals/cases.json');
const resultsDir = process.env.AGENT_EVAL_OUT || path.resolve(__dirname, '../../sead_agent/evals/results');
const label = process.env.AGENT_EVAL_LABEL || 'run';
const only = (process.env.AGENT_EVAL_ONLY || '').split(',').map(id => id.trim()).filter(id => id.length > 0);

const enabled = process.env.AGENT_EVAL === '1' && fs.existsSync(casesFile);
const cases = enabled
    ? JSON.parse(fs.readFileSync(casesFile, 'utf-8')).cases.filter(c => only.length == 0 || only.includes(c.id))
    : [];

const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsFile = path.join(resultsDir, runStamp+'-'+label+'.jsonl');

test.use({ baseURL: process.env.AGENT_EVAL_BASE_URL || 'https://sead.local' });
test.describe.configure({ mode: 'serial' });

async function dismissBlockingTutorial(page) {
    const tutorialDismissButton = page.locator('#tutorial-question .no-button');
    if(await tutorialDismissButton.isVisible().catch(() => false)) {
        await tutorialDismissButton.click();
    }
}

/*
* Follows the agent's requests on the network. A turn is the POST to /message and then
* one POST to /message/action-result per action, until an answer that is not
* action_required. Between legs, the browser is running the action.
*/
function watchAgentTraffic(page) {
    const legs = [];
    const waiters = [];
    page.on('request', request => {
        const url = request.url();
        if(request.method() == 'POST' && /\/sead-agent\/message(\/action-result)?$/.test(url)) {
            legs.push({ kind: url.endsWith('/action-result') ? 'result' : 'message', sentAt: Date.now(), body: request.postDataJSON(), request });
        }
    });
    page.on('response', async response => {
        const leg = legs.find(l => l.request === response.request());
        if(!leg) {
            return;
        }
        leg.answeredAt = Date.now();
        leg.status = response.status();
        try {
            leg.answer = await response.json();
        }
        catch(error) {
            leg.answer = null;
        }
        delete leg.request;
        const final = leg.status != 200 || !leg.answer || leg.answer.status != 'action_required';
        if(final) {
            waiters.splice(0).forEach(resolve => resolve());
        }
    });
    return {
        legs,
        nextFinalAnswer: () => new Promise(resolve => waiters.push(resolve))
    };
}

function summariseTurn(message, legs, startedAt) {
    const final = legs[legs.length - 1];
    let serverMs = 0;
    let browserMs = 0;
    const actions = [];
    legs.forEach((leg, index) => {
        serverMs += (leg.answeredAt || Date.now()) - leg.sentAt;
        if(index > 0) {
            browserMs += leg.sentAt - legs[index - 1].answeredAt;
        }
        if(leg.answer && leg.answer.status == 'action_required') {
            const next = legs[index + 1];
            actions.push({
                command: leg.answer.action.command,
                args: leg.answer.action.args,
                error: next && next.body ? next.body.error || null : null,
                result: next && next.body ? next.body.result : undefined
            });
        }
    });
    const withTurnId = legs.find(leg => leg.answer && leg.answer.turnId);
    return {
        message,
        //Matches the turn's line in the agent's log, which has its tokens and model requests
        turnId: withTurnId ? withTurnId.answer.turnId : null,
        status: final ? final.status : null,
        reply: final && final.answer ? (final.answer.output_text || final.answer.error || null) : null,
        totalMs: Date.now() - startedAt,
        serverMs,
        browserMs,
        legs: legs.length,
        actions
    };
}

for(const evalCase of cases) {
    test(evalCase.id, async ({ page }) => {
        test.setTimeout(300000);
        const traffic = watchAgentTraffic(page);

        await page.goto(evalCase.start || '/');
        await dismissBlockingTutorial(page);
        await expect(page.locator(evalCase.start && evalCase.start.startsWith('/site/') ? '#site-report-content' : '#result-container')).toBeVisible({ timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        if(evalCase.setup) {
            await page.evaluate(evalCase.setup);
        }

        await page.locator('#chatbox-icon').click();
        const input = page.locator('#chatbox-input');
        await expect(input).toBeVisible();

        const turns = [];
        for(const message of evalCase.messages) {
            //The agent counts messages per visitor; a run of questions can hit the minute
            //limit, which is not what is being measured - wait it out and send again
            for(let attempt = 0; attempt < 8; attempt++) {
                const firstLeg = traffic.legs.length;
                const startedAt = Date.now();
                const answered = traffic.nextFinalAnswer();
                await input.fill(message);
                await page.locator('#chatbox-send-btn').click();
                await answered;
                const legs = traffic.legs.slice(firstLeg);
                if(legs.length == 1 && legs[0].status == 429 && attempt < 7) {
                    await page.waitForTimeout(15000);
                    continue;
                }
                turns.push(summariseTurn(message, legs, startedAt));
                break;
            }
        }

        const state = await page.evaluate(() => {
            try {
                return window.sqs.stateManager.getInterfaceStateSummary();
            }
            catch(error) {
                return null;
            }
        });

        fs.mkdirSync(resultsDir, { recursive: true });
        fs.appendFileSync(resultsFile, JSON.stringify({ id: evalCase.id, category: evalCase.category, turns, state })+'\n');
    });
}
