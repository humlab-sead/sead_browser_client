/*
* Sharpening and blurring of an image on a canvas, for the sharpness control of the thin section viewer.
* A sharpness of 100 is the image as it is, above it is sharpened and below it is blurred.
*/

export const SHARPNESS_DEFAULT = 100;

function clamp8(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function createImageData(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d", { willReadFrequently: true }).createImageData(width, height);
}

function cloneImageData(imageData) {
    const clone = createImageData(imageData.width, imageData.height);
    clone.data.set(imageData.data);
    return clone;
}

function copyPixel(data, dst, i) {
    dst[i] = data[i];
    dst[i + 1] = data[i + 1];
    dst[i + 2] = data[i + 2];
    dst[i + 3] = data[i + 3];
}

function sharpenImageData(imageData, factor) {
    if (!imageData) return null;
    const { width, height, data } = imageData;

    if (Math.abs(factor - 1) < 0.0001) {
        return cloneImageData(imageData);
    }

    const amount = factor - 1;
    if (amount < 0) {
        return blurImageData(imageData, Math.abs(amount));
    }

    const output = createImageData(width, height);
    const dst = output.data;
    const centerWeight = 1 + (4 * amount);
    const sideWeight = -amount;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = ((y * width) + x) * 4;

            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                copyPixel(data, dst, i);
                continue;
            }

            const top = (((y - 1) * width) + x) * 4;
            const bottom = (((y + 1) * width) + x) * 4;
            const left = ((y * width) + (x - 1)) * 4;
            const right = ((y * width) + (x + 1)) * 4;

            for (let c = 0; c < 3; c++) {
                const value =
                    (data[i + c] * centerWeight) +
                    (data[top + c] * sideWeight) +
                    (data[bottom + c] * sideWeight) +
                    (data[left + c] * sideWeight) +
                    (data[right + c] * sideWeight);

                dst[i + c] = clamp8(value);
            }

            dst[i + 3] = data[i + 3];
        }
    }

    return output;
}

function blurImageData(imageData, amount) {
    if (!imageData) return null;
    const { width, height, data } = imageData;
    const output = createImageData(width, height);
    const dst = output.data;
    const blurAmount = Math.min(1, Math.max(0, amount));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = ((y * width) + x) * 4;

            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
                copyPixel(data, dst, i);
                continue;
            }

            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const ni = (((y + ky) * width) + (x + kx)) * 4;
                        sum += data[ni + c];
                    }
                }

                const blurred = sum / 9;
                const original = data[i + c];
                dst[i + c] = clamp8(
                    (original * (1 - blurAmount)) + (blurred * blurAmount)
                );
            }

            dst[i + 3] = data[i + 3];
        }
    }

    return output;
}

function applySharpness({
    source,
    outputCanvas,
    sharpness = SHARPNESS_DEFAULT
}) {
    if (!source) {
        throw new Error("applySharpness requires a source image.");
    }
    if (!outputCanvas) {
        throw new Error("applySharpness requires an output canvas.");
    }

    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) {
        throw new Error("applySharpness requires a source with width and height.");
    }

    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = width;
    originalCanvas.height = height;
    const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });
    originalCtx.drawImage(source, 0, 0, width, height);

    const original = originalCtx.getImageData(0, 0, width, height);
    const factor = sharpness / 100;
    const output = sharpenImageData(original, factor);
    outputCtx.putImageData(output, 0, 0);
    return outputCanvas;
}

export { applySharpness };
