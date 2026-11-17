# Modern OpenGL (3.3 Core) + GLFW + GLAD

## Context

```c
glfwInit();
glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
GLFWwindow *w = glfwCreateWindow(800, 600, "OpenGL Web IDE", NULL, NULL);
glfwMakeContextCurrent(w);
if (!gladLoadGL(glfwGetProcAddress)) { fprintf(stderr, "GLAD failed\n"); return 1; } /* glad2 API */
glfwSwapInterval(1);
```

Şablon loader'ı **GLAD 2** (ADR-010), `#include <glad/gl.h>` GLFW'den önce. Kullanıcı kodu GLAD 1 bekliyorsa: `gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)` + `<glad/glad.h>`; GLEW bekliyorsa: `glewExperimental = GL_TRUE; glewInit();` context'ten sonra, `-lglew32`. Şablonlar tek loader kullanır.

## Kaynak sırası

1. Shader derle → `glGetShaderiv(GL_COMPILE_STATUS)` + `glGetShaderInfoLog` stderr'e.
2. Program link → `GL_LINK_STATUS` + `glGetProgramInfoLog`.
3. VAO bağla → VBO (`GL_ARRAY_BUFFER`) → EBO (`GL_ELEMENT_ARRAY_BUFFER`, VAO bağlıyken) → `glVertexAttribPointer` + `glEnableVertexAttribArray`.
4. Döngü: `while(!glfwWindowShouldClose(w)) { glClear; glUseProgram; glBindVertexArray; glDrawElements; glfwSwapBuffers; glfwPollEvents; }`
5. Temizlik: `glDelete*`, `glfwTerminate`.

Core profile'da VAO **zorunludur**; VAO bağlı değilken draw = GL_INVALID_OPERATION.

## GLSL

```glsl
#version 330 core
layout(location = 0) in vec3 aPos;
void main() { gl_Position = vec4(aPos, 1.0); }
```

Shader'lar `.vert/.frag` dosyaları olarak proje içinde tutulur; çalışma dizini proje kökü olur, yollar göreli açılır. Şablon, dosya okunamazsa yolu stderr'e yazar.

## Hata ayıklama

- 4.3+ sürücülerde `GL_KHR_debug` / `glDebugMessageCallback` varsa Debug build'de etkinleştirilir; yoksa `glGetError` döngüsü makrosu.
- `glfwSetErrorCallback` her zaman stderr'e bağlanır.
- `glfwSetFramebufferSizeCallback` içinde `glViewport`.
