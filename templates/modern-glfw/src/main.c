/* Modern OpenGL (3.3 core) + GLFW + GLAD örneği: shader + VAO/VBO/EBO ile renkli dörtgen. */
#include <glad/gl.h>
#include <GLFW/glfw3.h>
#include <stdio.h>
#include <stdlib.h>

static char *read_file(const char *path)
{
    FILE *f = fopen(path, "rb");
    long n;
    char *buf;
    if (!f) { fprintf(stderr, "Shader dosyası açılamadı: %s\n", path); return NULL; }
    fseek(f, 0, SEEK_END);
    n = ftell(f);
    rewind(f);
    buf = malloc((size_t)n + 1);
    if (buf && fread(buf, 1, (size_t)n, f) == (size_t)n) buf[n] = '\0';
    else { free(buf); buf = NULL; }
    fclose(f);
    return buf;
}

static GLuint compile_shader(GLenum type, const char *path)
{
    char *src = read_file(path);
    GLuint s;
    GLint ok;
    if (!src) return 0;
    s = glCreateShader(type);
    glShaderSource(s, 1, (const char *const *)&src, NULL);
    glCompileShader(s);
    free(src);
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[1024];
        glGetShaderInfoLog(s, sizeof log, NULL, log);
        fprintf(stderr, "%s: shader derleme hatası:\n%s\n", path, log);
        glDeleteShader(s);
        return 0;
    }
    return s;
}

static GLuint create_program(const char *vs_path, const char *fs_path)
{
    GLuint vs = compile_shader(GL_VERTEX_SHADER, vs_path);
    GLuint fs = compile_shader(GL_FRAGMENT_SHADER, fs_path);
    GLuint p = 0;
    GLint ok;
    if (vs && fs) {
        p = glCreateProgram();
        glAttachShader(p, vs);
        glAttachShader(p, fs);
        glLinkProgram(p);
        glGetProgramiv(p, GL_LINK_STATUS, &ok);
        if (!ok) {
            char log[1024];
            glGetProgramInfoLog(p, sizeof log, NULL, log);
            fprintf(stderr, "Program link hatası:\n%s\n", log);
            glDeleteProgram(p);
            p = 0;
        }
    }
    if (vs) glDeleteShader(vs);
    if (fs) glDeleteShader(fs);
    return p;
}

static void glfw_error(int code, const char *msg) { fprintf(stderr, "GLFW hata %d: %s\n", code, msg); }
static void on_resize(GLFWwindow *w, int width, int height) { (void)w; glViewport(0, 0, width, height); }

int main(void)
{
    const char *tf = getenv("OGLIDE_TEST_FRAMES");
    int test_frames = tf ? atoi(tf) : 0; /* > 0 ise N kare çizip çıkar */
    int frame = 0;
    GLFWwindow *win;
    GLuint prog, vao, vbo, ebo;
    GLint u_time;

    static const float vertices[] = {
        /* konum            renk */
        -0.6f, -0.6f, 0.0f,  1.0f, 0.0f, 0.0f,
         0.6f, -0.6f, 0.0f,  0.0f, 1.0f, 0.0f,
         0.6f,  0.6f, 0.0f,  0.0f, 0.0f, 1.0f,
        -0.6f,  0.6f, 0.0f,  1.0f, 1.0f, 0.0f,
    };
    static const unsigned int indices[] = { 0, 1, 2, 2, 3, 0 };

    setvbuf(stdout, NULL, _IONBF, 0);
    glfwSetErrorCallback(glfw_error);
    if (!glfwInit()) return 1;

    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    win = glfwCreateWindow(800, 600, "OpenGL Web IDE - Modern", NULL, NULL);
    if (!win) { glfwTerminate(); return 1; }
    glfwMakeContextCurrent(win);
    if (!gladLoadGL(glfwGetProcAddress)) { fprintf(stderr, "GLAD yüklenemedi\n"); return 1; }
    glfwSwapInterval(1);
    glfwSetFramebufferSizeCallback(win, on_resize);

    printf("GL_VENDOR: %s\nGL_RENDERER: %s\nGL_VERSION: %s\n",
           glGetString(GL_VENDOR), glGetString(GL_RENDERER), glGetString(GL_VERSION));

    /* Çalışma dizini proje köküdür; shader yolları buna göredir. */
    prog = create_program("shaders/basic.vert", "shaders/basic.frag");
    if (!prog) { glfwTerminate(); return 1; }
    u_time = glGetUniformLocation(prog, "uTime");

    glGenVertexArrays(1, &vao);
    glGenBuffers(1, &vbo);
    glGenBuffers(1, &ebo);
    glBindVertexArray(vao);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof vertices, vertices, GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo); /* VAO bağlıyken: EBO VAO'ya kaydedilir */
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof indices, indices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void *)0);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void *)(3 * sizeof(float)));
    glEnableVertexAttribArray(1);
    glBindVertexArray(0);

    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
    while (!glfwWindowShouldClose(win)) {
        glClear(GL_COLOR_BUFFER_BIT);
        glUseProgram(prog);
        glUniform1f(u_time, (float)glfwGetTime());
        glBindVertexArray(vao);
        glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, 0);

        if (test_frames > 0 && ++frame >= test_frames) {
            int w, h;
            unsigned char px[3];
            glfwGetFramebufferSize(win, &w, &h);
            glReadBuffer(GL_BACK);
            glReadPixels(w / 2, h / 2, 1, 1, GL_RGB, GL_UNSIGNED_BYTE, px);
            printf("OGLIDE_PIXEL %d %d %d\n", px[0], px[1], px[2]);
            printf("OGLIDE_GLERROR %d\n", (int)glGetError());
            glfwSetWindowShouldClose(win, GLFW_TRUE);
        }
        glfwSwapBuffers(win);
        glfwPollEvents();
    }

    glDeleteVertexArrays(1, &vao);
    glDeleteBuffers(1, &vbo);
    glDeleteBuffers(1, &ebo);
    glDeleteProgram(prog);
    glfwTerminate();
    return 0;
}
