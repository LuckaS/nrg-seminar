// #part /glsl/shaders/previews/vertex

#version 300 es
precision mediump float;

layout(location = 0) in vec2 aPosition;
out vec2 vFragmentPosition;

void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vFragmentPosition = (aPosition + vec2(1.0, 1.0)) * 0.5;
}

// #part /glsl/shaders/previews/fragment

#version 300 es
precision mediump float;

uniform mediump sampler2D preview0;
uniform mediump sampler2D preview1;
uniform mediump sampler2D preview2;
uniform mediump sampler2D preview3;
uniform mediump sampler2D preview4;
uniform mediump sampler2D preview5;
uniform mediump sampler2D preview6;
uniform mediump sampler2D preview7;

in vec2 vFragmentPosition;

layout(location=0) out vec4 color0;
layout(location=1) out vec4 color1;
layout(location=2) out vec4 color2;
layout(location=3) out vec4 color3;
layout(location=4) out vec4 color4;
layout(location=5) out vec4 color5;
layout(location=6) out vec4 color6;
layout(location=7) out vec4 color7;

void main() {
    color0 = texture(preview0, vFragmentPosition);
    color1 = texture(preview1, vFragmentPosition);
    color2 = texture(preview2, vFragmentPosition);
    color3 = texture(preview3, vFragmentPosition);
    color4 = texture(preview4, vFragmentPosition);
    color5 = texture(preview5, vFragmentPosition);
    color6 = texture(preview6, vFragmentPosition);
    color7 = texture(preview7, vFragmentPosition);
}
