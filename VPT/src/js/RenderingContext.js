import { Vector } from './math/Vector.js';
import { Matrix } from './math/Matrix.js';
import { Quaternion } from './math/Quaternion.js';

import {WebGL as WEBGl, WebGL} from './WebGL.js';
import { Ticker } from './Ticker.js';
import { Camera } from './Camera.js';
import { OrbitCameraController } from './OrbitCameraController.js';
import { Volume } from './Volume.js';

import { RendererFactory } from './renderers/RendererFactory.js';
import { ToneMapperFactory } from './tonemappers/ToneMapperFactory.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders.json',
    'mixins.json',
].map(url => fetch(url).then(response => response.json())));

let drawTransferFunctions = false;

export class RenderingContext extends EventTarget {

constructor(options) {
    super();

    this._render = this._render.bind(this);
    this._webglcontextlostHandler = this._webglcontextlostHandler.bind(this);
    this._webglcontextrestoredHandler = this._webglcontextrestoredHandler.bind(this);

    this.handlePreviewClick = this.handlePreviewClick.bind(this);

    Object.assign(this, {
        _resolution : 512,
        _filter     : 'linear'
    }, options);

    this._canvas = document.createElement('canvas');
    this._canvas.id = "canvas";
    // this._canvas.width = Math.ceil(this._resolution * 1.5);
    this._canvas.width = Math.ceil(this._resolution);
    this._canvas.height = this._resolution;
    this._canvas.addEventListener('webglcontextlost', this._webglcontextlostHandler);
    this._canvas.addEventListener('webglcontextrestored', this._webglcontextrestoredHandler);

    this._initGL();

    // prepare preview canvases
    this._previews = [];
    const left = document.getElementById("left-previews");
    this._addPreviews(left, 0);

    const right = document.getElementById("right-previews");
    this._addPreviews(right, 4);

    // listen to checkbox change
    document.addEventListener("showPreviewTransferFunctions", function (e) {
        drawTransferFunctions = e.detail;
    })

    /*
    const items = [];

    // first preview column

    const left = document.getElementById("left-previews");
    const right = document.getElementById("right-previews");
    if (left && right) {
        this._addPreviews(left, items);
        this._addPreviews(right, items);
    }

    this._previews = items;
    */

    this._camera = new Camera();
    this._camera.position.z = 1.5;
    this._camera.fovX = 0.3;
    this._camera.fovY = 0.3;
    this._camera.updateMatrices();

    this._cameraController = new OrbitCameraController(this._camera, this._canvas);

    this._volume = new Volume(this._gl);
    this._scale = new Vector(1, 1, 1);
    this._translation = new Vector(0, 0, 0);
    this._isTransformationDirty = true;
    this._updateMvpInverseMatrix();
}

/*
_addPreviews(column, items) {
    const previews = 8;
    for (let i = 0; i < previews/2; i++) {
        let preview = document.createElement("div");
        column.appendChild(preview);
        preview.className = "preview";
        items.push({
            transferFunction: null, // TODO
            onclick: null, // TODO
            element: preview
        });
    }
}
 */

_addPreviews(column, startI) {
    const previews = 8;

    for (let i = startI; i < startI + previews/2; i++) {
        let preview = document.createElement("canvas");
        preview.id = "preview-" + i;
        preview.i = i;
        preview.width = Math.ceil(this._resolution * 0.25);
        preview.height = Math.ceil(this._resolution * 0.25);
        preview.className = "preview";
        preview.onclick = this.handlePreviewClick;
        column.appendChild(preview);

        const settings = {};

        this._previews.push({
            element: preview,
            settings: settings
        });

        this._initPreviewGL(i, settings);

        settings._volume = new Volume(settings._gl);

        preview.mySettings = settings;

        preview.addEventListener('webglcontextlost', this._webglcontextlostHandler);
        preview.addEventListener('webglcontextrestored', this._webglcontextrestoredHandler);
    }
}

// ============================ WEBGL SUBSYSTEM ============================ //

_initGL() {
    const contextSettings = {
        alpha                 : false,
        depth                 : false,
        stencil               : false,
        antialias             : false,
        preserveDrawingBuffer : true,
    };

    this._contextRestorable = true;

    let gl;
    gl = this._gl = this._canvas.getContext('webgl2', contextSettings);

    this._extLoseContext = gl.getExtension('WEBGL_lose_context');
    this._extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    this._extTextureFloatLinear = gl.getExtension('OES_texture_float_linear');

    if (!this._extColorBufferFloat) {
        console.error('EXT_color_buffer_float not supported!');
    }

    if (!this._extTextureFloatLinear) {
        console.error('OES_texture_float_linear not supported!');
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this._environmentTexture = WebGL.createTexture(gl, {
        width          : 1,
        height         : 1,
        data           : new Uint8Array([255, 255, 255, 255]),
        format         : gl.RGBA,
        internalFormat : gl.RGBA, // TODO: HDRI & OpenEXR support
        type           : gl.UNSIGNED_BYTE,
        wrapS          : gl.CLAMP_TO_EDGE,
        wrapT          : gl.CLAMP_TO_EDGE,
        min            : gl.LINEAR,
        max            : gl.LINEAR,
    });

    this._program = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }, MIXINS).quad;

    /* this._previewsProgram = WebGL.buildPrograms(gl, {
        previews: SHADERS.quad
    }, MIXINS).previews;
     */


    // this._rendererProgram = WebGL.buildPrograms(gl, SHADERS.renderers.MCM, MIXINS);

    this._clipQuad = WebGL.createClipQuad(gl);
}

_initPreviewGL(i, settings) {
    const contextSettings = {
        alpha                 : true,
        depth                 : false,
        stencil               : false,
        antialias             : false,
        preserveDrawingBuffer : true,
    };

    settings._contextRestorable = true;

    const gl = settings._gl = this._previews[i].element.getContext('webgl2', contextSettings);

    settings._extLoseContext = gl.getExtension('WEBGL_lose_context');
    settings._extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    settings._extTextureFloatLinear = gl.getExtension('OES_texture_float_linear');

    if (!settings._extColorBufferFloat) {
        console.error('EXT_color_buffer_float not supported!');
    }

    if (!settings._extTextureFloatLinear) {
        console.error('OES_texture_float_linear not supported!');
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    settings._environmentTexture = WebGL.createTexture(gl, {
        width          : 1,
        height         : 1,
        data           : new Uint8Array([255, 255, 255, 255]),
        format         : gl.RGBA,
        internalFormat : gl.RGBA, // TODO: HDRI & OpenEXR support
        type           : gl.UNSIGNED_BYTE,
        wrapS          : gl.CLAMP_TO_EDGE,
        wrapT          : gl.CLAMP_TO_EDGE,
        min            : gl.LINEAR,
        max            : gl.LINEAR,
    });

    settings._program = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }, MIXINS).quad;

    /* this._previewsProgram = WebGL.buildPrograms(gl, {
        previews: SHADERS.quad
    }, MIXINS).previews;
     */


    // this._rendererProgram = WebGL.buildPrograms(gl, SHADERS.renderers.MCM, MIXINS);

    settings._clipQuad = WebGL.createClipQuad(gl);
}

_webglcontextlostHandler(e) {
    if (e.currentTarget.mySettings) {
        if (e.currentTarget.mySettings._contextRestorable) {
            e.preventDefault();
        }
    } else if (this._contextRestorable) {
        e.preventDefault();
    }
}

_webglcontextrestoredHandler(e) {
    if (e.currentTarget.mySettings) {
        this._initPreviewGL(e.currentTarget.i, e.currentTarget.mySettings);
    } else {
        this._initGL();
    }
}

resize(width, height) {
    this._canvas.width = width;
    this._canvas.height = height;
    this._camera.resize(width, height);
}

async setVolume(reader) {
    this._volume = new Volume(this._gl, reader);
    this._volume.addEventListener('progress', e => {
        this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
    });
    await this._volume.readMetadata();
    await this._volume.readModality('default', this._previews);
    this._volume.setFilter(this._filter);

    // previews volume
    for (let i = 0; i < this._previews.length; i++) {
        const settings = this._previews[i].settings;
        settings._volume = new Volume(settings._gl, reader);
        settings._volume.addEventListener('progress', e => {
            this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
        });
        await settings._volume.readMetadata();
        await settings._volume.readModality('default');
        settings._volume.setFilter(this._filter);
        if (settings._renderer) {
            settings._renderer.setVolume(settings._volume);
        }
    }

    // console.log(this._volume);

    // main volume, start rendering
    if (this._renderer) {
        this._renderer.setVolume(this._volume);
        this.startRendering();
    }
}

setEnvironmentMap(image) {
    WebGL.createTexture(this._gl, {
        texture : this._environmentTexture,
        image   : image
    });
}

setFilter(filter) {
    this._filter = filter;
    if (this._volume) {
        this._volume.setFilter(filter);
        if (this._renderer) {
            this._renderer.reset();
        }
    }

    // previews volume
    for (let i = 0; i < this._previews.length; i++) {
        const settings = this._previews[i].settings;
        if (settings._volume) {
            settings._volume.setFilter(filter);
            if (settings._renderer) {
                settings._renderer.reset();
            }
        }
    }
}

chooseRenderer(renderer) {
    if (this._renderer) {
        this._renderer.destroy();
    }

    const rendererClass = RendererFactory(renderer);
    this._renderer = new rendererClass(this._gl, this._volume, this._environmentTexture, {
        _bufferSize: this._resolution
    });
    if (this._toneMapper) {
        this._toneMapper.setTexture(this._renderer.getTexture());
    }

    // set new previews renderer
    for (let i = 0; i < this._previews.length; i++) {
        const settings = this._previews[i].settings;
        if (settings._renderer) {
            settings._renderer.destroy();
        }

        settings._renderer = new rendererClass(settings._gl, settings._volume, settings._environmentTexture, {
            _bufferSize: this._resolution * 0.25 // previews are smaller
        });

        if (settings._toneMapper) {
            settings._toneMapper.setTexture(settings._renderer.getTexture());
        }
    }

    this._isTransformationDirty = true;
}

chooseToneMapper(toneMapper) {
    if (this._toneMapper) {
        this._toneMapper.destroy();
    }
    const gl = this._gl;
    let texture;
    if (this._renderer) {
        texture = this._renderer.getTexture();
    } else {
        texture = WebGL.createTexture(gl, {
            width  : 1,
            height : 1,
            data   : new Uint8Array([255, 255, 255, 255]),
        });
    }
    const toneMapperClass = ToneMapperFactory(toneMapper);
    this._toneMapper = new toneMapperClass(gl, texture, {
        _bufferSize: this._resolution,
    });

    // set new previews toneMapper
    for (let i = 0; i < this._previews.length; i++) {
        const settings = this._previews[i].settings;
        if (settings._toneMapper) {
            settings._toneMapper.destroy();
        }

        if (settings._renderer) {
            texture = settings._renderer.getTexture();
        } else {
            texture = WebGL.createTexture(settings._gl, {
                width  : 1,
                height : 1,
                data   : new Uint8Array([255, 255, 255, 255]),
            });
        }

        settings._toneMapper = new toneMapperClass(settings._gl, texture, {
            _bufferSize: this._resolution * 0.25 // previews are smaller,
        });
    }
}

getCanvas() {
    return this._canvas;
}

getRenderer() {
    return this._renderer;
}

getToneMapper() {
    return this._toneMapper;
}

_updateMvpInverseMatrix() {
    if (!this._camera.isDirty && !this._isTransformationDirty) {
        return;
    }

    this._camera.isDirty = false;
    this._isTransformationDirty = false;
    this._camera.updateMatrices();

    const centerTranslation = new Matrix().fromTranslation(-0.5, -0.5, -0.5);
    const volumeTranslation = new Matrix().fromTranslation(
        this._translation.x, this._translation.y, this._translation.z);
    const volumeScale = new Matrix().fromScale(
        this._scale.x, this._scale.y, this._scale.z);

    const modelMatrix = new Matrix();
    modelMatrix.multiply(volumeScale, centerTranslation);
    modelMatrix.multiply(volumeTranslation, modelMatrix);

    const viewMatrix = this._camera.viewMatrix;
    const projectionMatrix = this._camera.projectionMatrix;

    if (this._renderer) {
        this._renderer.modelMatrix.copy(modelMatrix);
        this._renderer.viewMatrix.copy(viewMatrix);
        this._renderer.projectionMatrix.copy(projectionMatrix);
        this._renderer.reset();
    }

    // preview renderers
    for (let i = 0; i < this._previews.length; i++) {
        const settings = this._previews[i].settings;
        if (settings._renderer) {
            settings._renderer.modelMatrix.copy(modelMatrix);
            settings._renderer.viewMatrix.copy(viewMatrix);
            settings._renderer.projectionMatrix.copy(projectionMatrix);
            settings._renderer.reset();
        }
    }
}

async _render() {
    const gl = this._gl;
    if (!gl || !this._renderer || !this._toneMapper) {
        return;
    }

    this._updateMvpInverseMatrix();

    // gl.enable(gl.SCISSOR_TEST);

    this._renderer.render();
    this._toneMapper.render();

    /*
    let texture = WEBGl.createTexture(gl, {
        width  : 2,
        height : 1,
        data   : new Uint8Array([0, 255, 0, 0, 0, 255, 0, 255]),
        wrapS  : gl.CLAMP_TO_EDGE,
        wrapT  : gl.CLAMP_TO_EDGE,
        min    : gl.LINEAR,
        mag    : gl.LINEAR,
    });
    gl.bindTexture(gl.TEXTURE_2D, texture);
    */

    // main canvas
    // gl.viewport(gl.drawingBufferWidth / 6, 0, 2 * gl.drawingBufferWidth / 3, gl.drawingBufferHeight);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    // gl.scissor(gl.drawingBufferWidth / 6, 0, 2 * gl.drawingBufferWidth / 3, gl.drawingBufferHeight);
    // gl.clearColor(1, 1, 1, 1);  // white

    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const program = this._program;
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
    const aPosition = program.attributes.aPosition;
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    // gl.activeTexture(gl.TEXTURE8);
    // gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());


    // Additional for Transfer function test
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    /*
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
    gl.texImage2D(gl.TEXTURE_2D, 0,
        gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, transferFunction);
     */

    // gl.uniform1i(program.uniforms.uTexture, 8);
    gl.uniform1i(program.uniforms.uTexture, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // gl.activeTexture(gl.TEXTURE8);
    // gl.bindTexture(gl.TEXTURE_2D, null);

    // this._renderer.render();
    // this._toneMapper.render();

    // await new Promise(resolve => setTimeout(resolve, 1000));

    gl.disableVertexAttribArray(aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // previews
    this.drawPreviews();
}

getScale() {
    return this._scale;
}

setScale(x, y, z) {
    this._scale.set(x, y, z);
    this._isTransformationDirty = true;
}

getTranslation() {
    return this._translation;
}

setTranslation(x, y, z) {
    this._translation.set(x, y, z);
    this._isTransformationDirty = true;
}

getResolution() {
    return this._resolution;
}

setResolution(resolution) {
    this._resolution = resolution;
    this._canvas.width = resolution;
    this._canvas.height = resolution;
    if (this._renderer) {
        this._renderer.setResolution(resolution);
    }
    if (this._toneMapper) {
        this._toneMapper.setResolution(resolution);
        if (this._renderer) {
            this._toneMapper.setTexture(this._renderer.getTexture());
        }
    }
}

startRendering() {
    Ticker.add(this._render);
}

stopRendering() {
    Ticker.remove(this._render);
}

drawPreviews() {
    for (let i = 0; i < this._previews.length; i++) {
        const preview = this._previews[i];
        const gl = preview.settings._gl;

        if (!gl || !preview.settings._renderer || !preview.settings._toneMapper) {
            return;
        }

        // clear canvas
        // gl.clearRect(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        /*
        const tfData = new Uint8Array([
            i < 4 ? 255 : 0, i < 4 ? 0 : 255, i < 2 || i > 5 ? 255 : 0, 0,
            i < 4 ? 255 : 0, i < 4 ? 0 : 255, i < 2 || i > 5 ? 255 : 0, 255,
            i >= 4 ? 255 : 0, i >= 4 ? 0 : 255, i < 2 || i > 5 ? 0 : 255, 0,
            i >= 4 ? 255 : 0, i >= 4 ? 0 : 255, i < 2 || i > 5 ? 0 : 255, 255
        ]);

        const tfWidth = 4;
        const tfHeight = 1;
        */
        if (drawTransferFunctions) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        }

        // console.log(preview);
        if (preview.transferFunction) {
            preview.settings._renderer.setPreviewTransferFunction({
                width: preview.transferFunction.length / 4, height: 1, data: preview.transferFunction
            });

            preview.settings._renderer.render();
            preview.settings._toneMapper.render();
        }

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const program = preview.settings._program;
        const aPosition = program.attributes.aPosition;

        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, preview.settings._clipQuad);
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        if (drawTransferFunctions) {
            // https://stackoverflow.com/questions/46215101/generating-text-texture-in-webgl-alpha-is-opaque
            // gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);
            // gl.enable(gl.BLEND);
            // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            // gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER,gl.NEAREST);
            // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            // const a = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, preview.settings._renderer._transferFunction);
            // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tfWidth, tfHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, tfData);

            // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, preview.settings._toneMapper.getTexture());
        }

        gl.uniform1i(program.uniforms.uTexture, 0);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.disableVertexAttribArray(aPosition);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }


    // https://webglfundamentals.org/webgl/lessons/webgl-2-textures.html

    /*
    const textures = [];
    const previewsProgram = this._previewsProgram;
    const previewsAPosition = previewsProgram.attributes.aPosition;

    for (let i = 0; i < this._previews.length; i++) {
        gl.useProgram(previewsProgram.program);

        gl.activeTexture(gl.TEXTURE0 + i);
        // set transfer function
        const textureData = new Uint8Array([i * 50, 0, 255, 0, i * 50, 0, 255, 255]);
        const newTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, newTexture);

        // TODO ?
        // Set the parameters so we can render any size image.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Upload the image into the texture.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureData);
        // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[ii]);

        // add the texture to the array of textures.
        textures.push(newTexture);

        // const currentPreviewLocation = gl.getUniformLocation(previewsProgram.program, `preview${i}`);
        gl.uniform1i(previewsProgram.uniforms[`preview${i}`], i);
    }
    */

    // previews left
    /*
    for (let i = 0; i < this._previews.length / 2; i++) {
        // set transfer function
        let textureData = new Uint8Array([0, 0, 255, 0, 0, 0, 255, 255]);
        this._renderer.setPreviewTransferFunction({
            width: 2, height: 1, data: textureData
        }, i);

        // code above does this: gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 3, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureData);

        gl.viewport(0, i * gl.drawingBufferHeight / 4, gl.drawingBufferWidth / 6, gl.drawingBufferHeight / 4);
        // gl.scissor(0, i * gl.drawingBufferHeight / 4, gl.drawingBufferWidth / 6, gl.drawingBufferHeight / 4);
        // gl.clearColor(0, 0, 1, 1);  // blue

        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE9 + i);
        gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());
        gl.uniform1i(program.uniforms.uTexture, 9 + i);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

        gl.activeTexture(gl.TEXTURE9 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // this._renderer.render(i);
        // this._toneMapper.render();

        await new Promise(resolve => setTimeout(resolve, 1000));

    }

    // previews right
    for (let i = 0; i < this._previews.length / 2; i++) {
        // TODO previews must be counted from this._previews.length / 2 to .length!

        // set transfer function
        let textureData = new Uint8Array([0, 255, 0, 0, 0, 255, 0, 255]);
        this._renderer.setPreviewTransferFunction({
            width: 2, height: 1, data: textureData
        }, i + this._previews.length / 2);
        // code above does this: gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 3, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureData);

        const x = 5 * gl.drawingBufferWidth / 6;
        const y = i * gl.drawingBufferHeight / 4;
        const w = gl.drawingBufferWidth / 6;
        const h = gl.drawingBufferHeight / 4;
        // this._renderer._integrateFrame(i + this._previews.length / 2);

        gl.viewport(x, y, w, h);
        // gl.scissor(x, y, w, h);
        // gl.clearColor(1, 0, 0, 1);  // red

        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._clipQuad);
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE9 + i + this._previews.length / 2);
        gl.bindTexture(gl.TEXTURE_2D, this._toneMapper.getTexture());
        gl.uniform1i(program.uniforms.uTexture, 9 + i + this._previews.length / 2);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

        gl.activeTexture(gl.TEXTURE9 + i + this._previews.length / 2);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // this._renderer.render(i + this._previews.length / 2, x, y, w, h);
        // this._toneMapper.render();

        await new Promise(resolve => setTimeout(resolve, 2000));

    }
     */

}

async handlePreviewClick(e) {
    this._renderer.setPreviewTransferFunction({
        width: this._previews[e.target.i].transferFunction.length / 4, height: 1, data: this._previews[e.target.i].transferFunction
    });

    // call for new functions
    // send selected tf to the server
    const previewTransferFunctions = await this._volume.sendFeatures({
        "tfIndex": e.target.i
    });

    for (let i = 0; i < previewTransferFunctions.length; i++) {
        this._previews[i].transferFunction = this._volume.interpolateTransferFunction(previewTransferFunctions[i]);
        // reset all renderers
        this._previews[i].settings._renderer.reset();
    }

    // reset main renderer
    this._renderer.reset();
}

}
