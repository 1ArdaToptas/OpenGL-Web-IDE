#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;

uniform float uTime;
out vec3 vColor;

void main()
{
    float c = cos(uTime), s = sin(uTime);
    gl_Position = vec4(c * aPos.x - s * aPos.y, s * aPos.x + c * aPos.y, aPos.z, 1.0);
    vColor = aColor;
}
