import { WebGL } from './WebGL.js';

export class SingleBuffer {

constructor(gl, spec) {
    this._gl = gl;
    this._spec = spec;

    this._attachments = this._createAttachmentsFromSpec(gl, this._spec);
    this._framebuffer = WebGL.createFramebuffer(gl, this._attachments);

    this._width = this._spec[0].width;
    this._height = this._spec[0].height;
}

destroy() {
    const gl = this._gl;
    gl.deleteFramebuffer(this._framebuffer);
    for (let texture of this._attachments.color) {
        gl.deleteTexture(texture);
    }
}

_createAttachmentsFromSpec(gl, spec) {
    return { color: spec.map(s => WebGL.createTexture(gl, s)) };
}

use(/*x = 0, y = 0, w = this._width, h = this._height*/) {
    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);
    gl.viewport(0, 0, this._width, this._height);
}

/*
use(x = 0, y = 0, w = this._width, h = this._width) {
    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);
    gl.viewport(x, y, w, h);
}
 */

getAttachments() {
    return this._attachments;
}

}
