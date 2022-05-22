// Logic behind the functionalities

const d3 = require('../d3-7.4.4/package/dist/d3.min');
// import * as d3 from "d3";

const tfNumber = 8;

let changesRate = 0.8; // every time, adaptS, V and H get smaller so changes are smaller

let startS = 10; // 1 -> 100 gets more colorful, way stronger colors
const sRange = 100;
let adaptS = 30;

let startV = 0; // 1 -> 10 make it consecutively darker
const vRange = 10;
let adaptV = 4;

let adaptH = 2 / 3; // change hue

class Controller {

    constructor(volume) {
        this.volume = volume;

        // calculate transfer functions
        this.transferFunctions = [];
        this.transferFunctionsSettings = [];
        this.calculateVolumeData();
        this.calculateTransferFunctions();

    }

    calculateVolumeData() {
        // get max variance in all of clusters
        // https://stackoverflow.com/a/31844649
        this.maxVariance = this.volume.reduce(function(previous, current) {
            return previous.variance > current.variance ? previous : current;
        }).variance;

        this.minVariance = this.volume.reduce(function(previous, current) {
            return previous.variance < current.variance ? previous : current;
        }).variance;

        this.minDistanceToCenter = this.volume.reduce(function(previous, current) {
            return previous.distanceToVolumeCenter < current.distanceToVolumeCenter ? previous : current;
        }).distanceToVolumeCenter;

        this.maxDistanceToCenter = this.volume.reduce(function(previous, current) {
            return previous.distanceToVolumeCenter > current.distanceToVolumeCenter ? previous : current;
        }).distanceToVolumeCenter;
    }

    calculateTransferFunctions() {
        for (let tf = 0; tf < tfNumber; tf++) {
            const currentTF = [];
            const tfSettings = [];
            for (let i = 0; i < this.volume.length; i++) {
                const c = this.volume[i]; // current cluster

                const tfClusterSettings = {};

                // change border values

                tfClusterSettings.startS = startS + Math.random() * adaptS - (adaptS / 2); // goes by adaptS/2 up or down
                if (tfClusterSettings.startS > sRange) {
                    tfClusterSettings.startS = sRange;
                } else if (tfClusterSettings.startS < 0) {
                    tfClusterSettings.startS = 0;
                }

                /* let maxS = 10; // 1 -> 100 gets more colorful, way stronger colors
                const sRange = 100;
                let adaptS = 30;*/

                tfClusterSettings.startV = startV + Math.random() * adaptV - (adaptV / 2); // goes by adaptV/2 up or down
                if (tfClusterSettings.startV > vRange) {
                    tfClusterSettings.startV = vRange;
                } else if (tfClusterSettings.startV < 0) {
                    tfClusterSettings.startV = 0;
                }

                /*
                let maxV = 0; // 1 -> 10 make it consecutively darker
                const vRange = 10;
                let adaptV = 4;*/
                // calculate variance, saturation and alpha

                // saturation of cluster

                // from Quick2Insight
                // c.S = 1 / (1 + c.variance);

                // Test: divide (min S is 0.5, does not get to 0)
                // c.S = 1 / (1 + (1 - (minVariance / c.variance)));

                // variance is too big, substract smallest variance from current variance
                // to get best saturation with most compact clusters
                // c.S = 1 / (1 + (c.variance - minVariance));

                // larger variances are still too large, set both alpha and saturation as
                // linear interpolation between value 0 for minVariance and 1 for maxVariance

                tfClusterSettings.S = 1 / (1 + this.interpolateToNewRange(c.variance, this.minVariance, this.maxVariance, 0, tfClusterSettings.startS));
                // console.log("Variance", minVariance, maxVariance, c.variance, this.interpolateToNewRange(c.variance, minVariance, maxVariance, 0, 10), this.interpolateLogarithmic(c.variance, minVariance, maxVariance, 0, 10), this.interpolateExponential(c.variance, minVariance, maxVariance, 0, 10));

                // c.S = this.interpolateLogarithmic(c.variance, minVariance, maxVariance, 0, 100);
                // console.log(minVariance, maxVariance, c.variance, this.interpolateToNewRange(c.variance, minVariance, maxVariance, 0, 100), c.S);
                // value of cluster
                // from Quick2Insight
                // c.V = 1 / (1 + c.distanceToVolumeCenter);

                // above values are too small (max is 0.2 for test dataset), interpolate between minDistance and maxDistance
                tfClusterSettings.V = 1 / (1 + this.interpolateExponential(c.distanceToVolumeCenter, this.minDistanceToCenter, this.maxDistanceToCenter, 0, tfClusterSettings.startV, 3));

                // console.log("Distance", minDistanceToCenter, maxDistanceToCenter, c.distanceToVolumeCenter, this.interpolateToNewRange(c.distanceToVolumeCenter, minDistanceToCenter, maxDistanceToCenter, 0, 10), this.interpolateLogarithmic(c.distanceToVolumeCenter, minDistanceToCenter, maxDistanceToCenter, 0, 10), this.interpolateExponential(c.distanceToVolumeCenter, minDistanceToCenter, maxDistanceToCenter, 0, 10));

                // alpha
                // console.log(i, c.variance);
                // from Quick2Insight
                // c.A = 1 - (c.variance / maxVariance);
                // maxVariance is too big compared to average variance

                // alpha for minVariance is 1, alpha for maxVariance is 0, interpolate between
                // set both alpha and saturation as
                // linear interpolation between value 0 for minVariance and 1 for maxVariance
                tfClusterSettings.A = 1 - this.interpolateToNewRange(c.variance, this.minVariance, this.maxVariance, 0, 1);
                // c.A = 1 - this.interpolateLogarithmic(c.variance, minVariance, maxVariance, 0, 1);

                tfClusterSettings.Hi = Math.random(); // random color in color wheel

                // console.log(Hi, c.S, c.V, c.A);
                // console.log(this.convertHSVToRGB(Hi, c.S, c.V, c.A));

                currentTF.push({
                    position: Math.round(c.mean.v),
                    value: this.convertHSVToRGB(tfClusterSettings.Hi, tfClusterSettings.S, tfClusterSettings.V, tfClusterSettings.A)
                })

                tfSettings.push(tfClusterSettings);
            }

            this.transferFunctions.push(currentTF);

            this.transferFunctionsSettings.push(tfSettings);
        }

        adaptS *= changesRate; // smaller changes each time
        adaptV *= changesRate; // smaller changes each time
        adaptH *= changesRate; // smaller changes each time

    }

    interpolateToNewRange(number, min, max, newMin, newMax) {
        // Adapted from https://stackoverflow.com/a/23202637
        return (number - min) * (newMax - newMin) / (max - min) + newMin;
    }

    interpolateLogarithmic(number, min, max, newMin, newMax) {
        let myScale = d3.scaleLog()  //  d3.scaleLinear()
            .domain([min, max])
            .range([newMin, newMax]);

        return myScale(number);
    }

    interpolateExponential(number, min, max, newMin, newMax, exponent = 3) {
        let myScale = d3.scalePow()
            .exponent(exponent)
            .domain([min, max])
            .range([newMin, newMax]);

        return myScale(number);
    }

    adaptFunctions(selectedFunction) {

        const selectedSettings = this.transferFunctionsSettings[selectedFunction];

        for (let tf = 0; tf < tfNumber; tf++) {

            if (tf === selectedFunction) { // first adapt others, then selected one
                continue;
            }

            this.adaptSelectedFunction(tf, selectedSettings);

        }

        this.adaptSelectedFunction(selectedFunction, selectedSettings);

        adaptS *= changesRate; // smaller changes each time
        adaptV *= changesRate; // smaller changes each time
        adaptH *= changesRate; // smaller changes each time

    }

    adaptSelectedFunction(tf, selectedSettings) {
        const currentTF = this.transferFunctions[tf];
        const currentSettings = this.transferFunctionsSettings[tf];

        for (let i = 0; i < currentTF.length; i++) {
            const c = this.volume[i]; // current cluster
            const currentClusterSettings = currentSettings[i];

            const selectedClusterSettings = selectedSettings[i];

            // adapt by selected function
            currentClusterSettings.startS = selectedClusterSettings.startS + Math.random() * adaptS - (adaptS / 2); // goes by adaptS/2 up or down
            if (currentClusterSettings.startS > sRange) {
                currentClusterSettings.startS = sRange;
            } else if (currentClusterSettings.startS < 0) {
                currentClusterSettings.startS = 0;
            }

            /* let maxS = 10; // 1 -> 100 gets more colorful, way stronger colors
            const sRange = 100;
            let adaptS = 30;*/

            // adapt by selected function
            currentClusterSettings.startV = selectedClusterSettings.startV + Math.random() * adaptV - (adaptV / 2); // goes by adaptV/2 up or down
            if (currentClusterSettings.startV > vRange) {
                currentClusterSettings.startV = vRange;
            } else if (currentClusterSettings.startV < 0) {
                currentClusterSettings.startV = 0;
            }

            currentClusterSettings.S = 1 / (1 + this.interpolateToNewRange(c.variance, this.minVariance, this.maxVariance, 0, currentClusterSettings.startS));

            currentClusterSettings.V = 1 / (1 + this.interpolateExponential(c.distanceToVolumeCenter, this.minDistanceToCenter, this.maxDistanceToCenter, 0, currentClusterSettings.startV, 3));

            currentClusterSettings.A = 1 - this.interpolateToNewRange(c.variance, this.minVariance, this.maxVariance, 0, 1);


            // adapt by selected function
            currentClusterSettings.Hi = selectedClusterSettings.Hi + Math.random() * adaptH - (adaptH / 2); // goes by adaptH/2 up or down
            if (currentClusterSettings.Hi > 1) {
                currentClusterSettings.Hi -= 1;
            } else if (currentClusterSettings.Hi < 0) {
                currentClusterSettings.Hi += 1;
            }

            currentTF[i] = {
                position: Math.round(c.mean.v),
                value: this.convertHSVToRGB(currentClusterSettings.Hi, currentClusterSettings.S, currentClusterSettings.V, currentClusterSettings.A)
            };

            currentSettings[i] = currentClusterSettings;
        }

        this.transferFunctions[tf] = currentTF;

        this.transferFunctionsSettings[tf] = currentSettings;
    }

    // getting all parameters
    getParameters(selectedFunction = null) {
        let transferFunctions = [];
        if (selectedFunction !== null) {
            // change functions slightly
            this.adaptFunctions(selectedFunction);
        } else {
            adaptS = 30;

            adaptV = 4;

            adaptH = 2 / 3; // change hue
        }
        transferFunctions = this.transferFunctions;

        return { "transferFunctions": transferFunctions };
    }

    /**
     * Converts an HSV color value to RGB. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
     * Assumes h, s, and v are contained in the set [0, 1] and
     * returns r, g, and b in the set [0, 255].
     *
     * @param  h       The hue !! hue also has to be [0, 1]
     * @param  s       The saturation
     * @param  v       The value
     * @param  a       The opacity
     * @return  Object          The RGBA representation
     *
     * Adapted: added alpha
     */
    convertHSVToRGB(h, s, v, a) {
        // Adapted from https://axonflux.com/handy-rgb-to-hsl-and-rgb-to-hsv-color-model-c
        let r, g, b;

        let i = Math.floor(h * 6);
        let f = h * 6 - i;
        let p = v * (1 - s);
        let q = v * (1 - f * s);
        let t = v * (1 - (1 - f) * s);

        switch(i % 6){
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }

        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: Math.round(a * 255) };
    }
}
module.exports = Controller;