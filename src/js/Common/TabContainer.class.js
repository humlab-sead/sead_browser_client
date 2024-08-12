class TabContainer {
    constructor(selector, container = null, defaultTab = 0) {
        let tabContainer = container;
        if(tabContainer == null) {
          tabContainer = document;
        }

        this.tabButtons = tabContainer.querySelectorAll(selector+' .tab-button');
        this.tabPanels = tabContainer.querySelectorAll(selector+' .tab-panel');

        this.tabButtons.forEach((button, index) => {
            button.addEventListener('click', () => {
                this.showTab(index);
            });
        });

        this.showTab(defaultTab);
    }

    showTab(tabIndex) {
      this.tabButtons.forEach((button) => {
        button.classList.remove('active');
      });
      this.tabPanels.forEach((panel) => {
        panel.classList.remove('active');
      });
      this.tabButtons[tabIndex].classList.add('active');
      this.tabPanels[tabIndex].classList.add('active');
    }
}

export default TabContainer;