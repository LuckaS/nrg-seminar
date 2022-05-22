import { WebGL } from './WebGL.js';

export class Volume extends EventTarget {

constructor(gl, reader, options) {
    super();

    Object.assign(this, {
        ready: false
    }, options);

    this._gl = gl;
    this._reader = reader;

    this.meta       = null;
    this.modalities = null;
    this.blocks     = null;
    this._texture   = null;
}

destroy() {
    const gl = this._gl;
    if (this._texture) {
        gl.deleteTexture(this._texture);
    }
}

async readMetadata() {
    if (!this._reader) {
        return;
    }

    this.ready = false;
    const data = await this._reader.readMetadata();
    this.meta = data.meta;
    this.modalities = data.modalities;
    this.blocks = data.blocks;
}

async readModality(modalityName, previews = false) {
    if (!this._reader) {
        throw new Error('No reader');
    }

    if (!this.modalities) {
        throw new Error('No modalities');
    }

    this.ready = false;
    const modality = this.modalities.find(modality => modality.name === modalityName);
    if (!modality) {
        throw new Error('Modality does not exist');
    }

    const dimensions = modality.dimensions;
    const components = modality.components;
    const blocks = this.blocks;

    const gl = this._gl;
    if (this._texture) {
        gl.deleteTexture(this._texture);
    }
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this._texture);

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texStorage3D(gl.TEXTURE_3D, 1, modality.internalFormat,
        dimensions.width, dimensions.height, dimensions.depth);

    let volumePoints = [];
    let volumeValues = [];
    let volumePositions = [];

    for (const placement of modality.placements) {
        const data = await this._reader.readBlock(placement.index);

        const progress = (placement.index + 1) / modality.placements.length;
        this.dispatchEvent(new CustomEvent('progress', { detail: progress }));
        const position = placement.position;
        const block = blocks[placement.index];
        const blockdim = block.dimensions;

        if (previews) {
            const values = this._typize(data, modality.type)

            for (let i = 0; i < values.length; i++) {
                volumeValues.push(values[i]);
                volumePositions.push({
                    x: i % blockdim.width,
                    y: Math.floor(i / blockdim.width),
                    z: placement.position.z
                });
                volumePoints.push({
                    x: i % blockdim.width,
                    y: Math.floor(i / blockdim.width),
                    z: placement.position.z,
                    value: values[i]
                })
            }
        }

        gl.bindTexture(gl.TEXTURE_3D, this._texture);
        gl.texSubImage3D(gl.TEXTURE_3D, 0,
            position.x, position.y, position.z,
            blockdim.width, blockdim.height, blockdim.depth,
            modality.format, modality.type, this._typize(data, modality.type));
    }

    if (previews) {
        // https://github.com/d3/d3/blob/main/API.md
        let histGenerator = d3.bin()
            // .domain([0, 255])    // Set the domain to cover the entire intervall [0;]
            // .thresholds(19);  // number of thresholds; this will create 19+1 bins
            .thresholds(d3.thresholdSturges) // thresholdSturges 26, thresholdScott 1276, thresholdFreedmanDiaconis 12751
            .value(d => d.value);
        // bin.thresholds - specify how values are divided into bins.
        // d3.thresholdFreedmanDiaconis - the Freedman–Diaconis binning rule.
        // d3.thresholdScott - Scott’s normal reference binning rule.
        // d3.thresholdSturges - Sturges’ binning formula.

        // let bins = histGenerator(volumeValues); // array of arrays

        let bins = histGenerator(volumePoints); // array of arrays

        // x0 - the lower bound of the bin (inclusive).
        // x1 - the upper bound of the bin (exclusive, except for the last bin).

        // console.log(bins);

        const features = [];

        for (let i = 0; i < bins.length; i++) {
            // different colors based on cluster spatial variance, cluster mass distance from volume center - Quick2Insight
            const bin = bins[i];
            const mean = {
                x: 0, y: 0, z: 0, v: 0
            };// cluster centroid / mean of cluster

            for (let j = 0; j < bin.length; j++) {
                mean.x += bin[j].x;
                mean.y += bin[j].y;
                mean.z += bin[j].z;
                mean.v += bin[j].value;
            }

            // centroid
            mean.x /= bin.length;
            mean.y /= bin.length;
            mean.z /= bin.length;
            mean.v /= bin.length;

            let variance = 0;
            for (let j = 0; j < bin.length; j++) {
                // distance between points squared
                // d = ((x2 - x1)^2 + (y2 - y1)^2 + (z2 - z1)^2)^1/2
                const distances = {
                    x: bin[j].x - mean.x,
                    y: bin[j].y - mean.y,
                    z: bin[j].z - mean.z
                }

                // Cluster spatial variance
                // https://stats.stackexchange.com/questions/86645/variance-within-each-cluster
                // According to the Hastie equation 14.31 (see also Halkidi et al. 2001), the within-cluster variance
                // W(Ck) of a cluster Ck is defined (for the Euclidean distance) as ∑xi∈Ck∥xi−x¯k∥2 ,
                // where x¯k is the mean of cluster Ck (also called the cluster centroid,
                // its values are the coordinate-wise average of the data points in Ck),
                // and {x1,...,xN} is the set of observations (they are vectors, i.e., one coordinate per dimension).
                // In plain English, the cluster variance is the coordinate-wise squared deviations
                // from the mean of the cluster of all the observations belonging to that cluster.

                variance += (distances.x * distances.x) + (distances.y * distances.y) + (distances.z * distances.z);
            }

            // center of mass
            // https://stats.stackexchange.com/questions/51743/how-is-finding-the-centroid-different-from-finding-the-mean
            // The centroid is also sometimes called the center of mass or barycenter, based on its physical interpretation (it's the center of mass of an object defined by the points).

            const volumeCenter = {
                x: modality.dimensions.width / 2,
                y: modality.dimensions.height / 2,
                z: modality.dimensions.depth / 2
            };

            const distances = {
                x: mean.x - volumeCenter.x,
                y: mean.y - volumeCenter.y,
                z: mean.z - volumeCenter.z,
            }

            const centroidDistance = Math.sqrt((distances.x * distances.x) + (distances.y * distances.y) + (distances.z * distances.z))

            features.push({
                minValue: bin.x0,
                maxValue: bin.x1,
                numberOfPoints: bin.length,
                mean: mean,
                variance: variance,
                distanceToVolumeCenter: centroidDistance
            })
        }

        // send features to the server
        const previewTransferFunctions = await this.sendFeatures({
            "volume": features
        });

        for (let i = 0; i < previewTransferFunctions.length; i++) {
            previews[i].transferFunction = this.interpolateTransferFunction(previewTransferFunctions[i]);
        }
    }

    // console.log("all", all, "-", "0-255", colors);

    this.ready = true;
}

_typize(data, type) {
    const gl = this._gl;
    switch (type) {
        case gl.BYTE:                         return new Int8Array(data);
        case gl.UNSIGNED_BYTE:                return new Uint8Array(data);
        case gl.UNSIGNED_BYTE:                return new Uint8ClampedArray(data);
        case gl.SHORT:                        return new Int16Array(data);
        case gl.UNSIGNED_SHORT:               return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_5_6_5:         return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_5_5_5_1:       return new Uint16Array(data);
        case gl.UNSIGNED_SHORT_4_4_4_4:       return new Uint16Array(data);
        case gl.INT:                          return new Int32Array(data);
        case gl.UNSIGNED_INT:                 return new Uint32Array(data);
        case gl.UNSIGNED_INT_5_9_9_9_REV:     return new Uint32Array(data);
        case gl.UNSIGNED_INT_2_10_10_10_REV:  return new Uint32Array(data);
        case gl.UNSIGNED_INT_10F_11F_11F_REV: return new Uint32Array(data);
        case gl.UNSIGNED_INT_24_8:            return new Uint32Array(data);
        case gl.HALF_FLOAT:                   return new Uint16Array(data);
        case gl.FLOAT:                        return new Float32Array(data);
        default: throw new Error('Unknown volume datatype: ' + type);
    }
}

getTexture() {
    if (this.ready) {
        return this._texture;
    } else {
        return null;
    }
}

setFilter(filter) {
    if (!this._texture) {
        return;
    }

    const gl = this._gl;
    filter = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_3D, this._texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
}

async sendFeatures(postData) {

    // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

    try {
        return fetch("http://localhost:5000/api/get-transfer-functions", {
            method: 'POST', // *GET, POST, PUT, DELETE, etc.
            mode: 'cors', // no-cors, *cors, same-origin
            // cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
            // credentials: 'same-origin', // include, *same-origin, omit
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
                // 'Content-Type': 'application/x-www-form-urlencoded',
            },
            // redirect: 'follow', // manual, *follow, error
            // referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            body: JSON.stringify(postData) // body data type must match "Content-Type" header
        })
            .then(res => res.json())
            .then(function(data) {
                return data?.transferFunctions;
            })
            .catch(function(res){
                console.log(res);
                return [];
            })
    } catch(exception) {
        console.log(exception);
        return [];
    }

}

interpolateTransferFunction(tfArray) {
    if (!tfArray.length) return [];

    const tf = new Uint8Array(256 * 4); // for 0-255 r, g, b, a, color values
    let filled = 0; // transfer function current position (piksel number * 4)
    let i = 0; // piksel number
    while (i < tfArray[0].position) {
        tf[filled] = tfArray[i].value.r;
        tf[filled + 1] = tfArray[i].value.g;
        tf[filled + 2] = tfArray[i].value.b;
        tf[filled + 3] = tfArray[i].value.a;

        filled += 4;
        i++;
    }
    // start at 0
    for (let j = 0; j < tfArray.length - 1; j++) {
        // add values from j to j + 1, but do not add j + 1

        // position and color diff between j and j + 1
        const positionDiff = tfArray[j + 1].position - tfArray[j].position; // this is "100%" in interpolation
        const colorDiff = {
            r: tfArray[j + 1].value.r - tfArray[j].value.r,
            g: tfArray[j + 1].value.g - tfArray[j].value.g,
            b: tfArray[j + 1].value.b - tfArray[j].value.b,
            a: tfArray[j + 1].value.a - tfArray[j].value.a,
        }

        while (i < tfArray[j + 1].position) {
            // current position substracted by j position
            const currentPointPosition = i - tfArray[j].position;
            // 0-1 percentage distance from current position to j position
            const currentPointDistance = currentPointPosition / positionDiff; // from 0 to 1
            // interpolate
            tf[filled] = Math.round(tfArray[j].value.r + (currentPointDistance * colorDiff.r));
            tf[filled + 1] = Math.round(tfArray[j].value.g + (currentPointDistance * colorDiff.g));
            tf[filled + 2] = Math.round(tfArray[j].value.b + (currentPointDistance * colorDiff.b));
            tf[filled + 3] = Math.round(tfArray[j].value.a + (currentPointDistance * colorDiff.a));

            filled += 4;
            i++;
        }
    }
    // from last position to 255
    while (i < 256) {
        tf[filled] = tfArray[tfArray.length - 1].value.r;
        tf[filled + 1] = tfArray[tfArray.length - 1].value.g;
        tf[filled + 2] = tfArray[tfArray.length - 1].value.b;
        tf[filled + 3] = tfArray[tfArray.length - 1].value.a;

        filled += 4;
        i++;
    }

    // console.log(tf);

    return tf;
}

}