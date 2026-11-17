/* Modern OpenGL (3.3 core) statik örnek: perspektif projeksiyonlu, derinlik testli renkli küp.
 * Matrisler sütun öncelikli (OpenGL düzeni) olarak C'de hesaplanır; ek kütüphane yok. */
#include <glad/gl.h>
#include <GLFW/glfw3.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef float Mat4[16];

static void mat4_identity(Mat4 m) { memset(m, 0, sizeof(Mat4)); m[0] = m[5] = m[10] = m[15] = 1.0f; }

static void mat4_mul(Mat4 out, const Mat4 a, const Mat4 b)
{
    Mat4 r;
    for (int c = 0; c < 4; ++c)
        for (int row = 0; row < 4; ++row) {
            r[c * 4 + row] = 0.0f;
            for (int k = 0; k < 4; ++k) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
        }
    memcpy(out, r, sizeof(Mat4));
}

static void mat4_perspective(Mat4 m, float fovy, float aspect, float near, float far)
{
    float f = 1.0f / tanf(fovy / 2.0f);
    memset(m, 0, sizeof(Mat4));
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1.0f;
    m[14] = 2.0f * far * near / (near - far);
}

static void mat4_rotate_x(Mat4 m, float a) { mat4_identity(m); m[5] = cosf(a); m[6] = sinf(a); m[9] = -sinf(a); m[10] = cosf(a); }
static void mat4_rotate_y(Mat4 m, float a) { mat4_identity(m); m[0] = cosf(a); m[2] = -sinf(a); m[8] = sinf(a); m[10] = cosf(a); }

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

/* Her yüz: 4 köşe (konum xyz + renk rgb). */
static const float VERTICES[] = {
    /* ön (+z) kırmızı */
    -0.5f, -0.5f,  0.5f, 0.9f, 0.2f, 0.2f,   0.5f, -0.5f,  0.5f, 0.9f, 0.2f, 0.2f,
     0.5f,  0.5f,  0.5f, 0.9f, 0.2f, 0.2f,  -0.5f,  0.5f,  0.5f, 0.9f, 0.2f, 0.2f,
    /* arka (-z) yeşil */
    -0.5f, -0.5f, -0.5f, 0.2f, 0.8f, 0.3f,   0.5f, -0.5f, -0.5f, 0.2f, 0.8f, 0.3f,
     0.5f,  0.5f, -0.5f, 0.2f, 0.8f, 0.3f,  -0.5f,  0.5f, -0.5f, 0.2f, 0.8f, 0.3f,
    /* sağ (+x) mavi */
     0.5f, -0.5f, -0.5f, 0.2f, 0.4f, 0.9f,   0.5f,  0.5f, -0.5f, 0.2f, 0.4f, 0.9f,
     0.5f,  0.5f,  0.5f, 0.2f, 0.4f, 0.9f,   0.5f, -0.5f,  0.5f, 0.2f, 0.4f, 0.9f,
    /* sol (-x) sarı */
    -0.5f, -0.5f, -0.5f, 0.9f, 0.8f, 0.2f,  -0.5f,  0.5f, -0.5f, 0.9f, 0.8f, 0.2f,
    -0.5f,  0.5f,  0.5f, 0.9f, 0.8f, 0.2f,  -0.5f, -0.5f,  0.5f, 0.9f, 0.8f, 0.2f,
    /* üst (+y) camgöbeği */
    -0.5f,  0.5f, -0.5f, 0.2f, 0.8f, 0.8f,   0.5f,  0.5f, -0.5f, 0.2f, 0.8f, 0.8f,
     0.5f,  0.5f,  0.5f, 0.2f, 0.8f, 0.8f,  -0.5f,  0.5f,  0.5f, 0.2f, 0.8f, 0.8f,
    /* alt (-y) eflatun */
    -0.5f, -0.5f, -0.5f, 0.8f, 0.3f, 0.8f,   0.5f, -0.5f, -0.5f, 0.8f, 0.3f, 0.8f,
     0.5f, -0.5f,  0.5f, 0.8f, 0.3f, 0.8f,  -0.5f, -0.5f,  0.5f, 0.8f, 0.3f, 0.8f,
};

int main(void)
{
    const char *tf = getenv("OGLIDE_TEST_FRAMES");
    int test_frames = tf ? atoi(tf) : 0; /* > 0 ise N kare çizip çıkar */
    int frame = 0;
    unsigned int indices[36];
    GLFWwindow *win;
    GLuint prog, vao, vbo, ebo;
    GLint u_mvp;

    for (int face = 0; face < 6; ++face) {
        static const unsigned int quad[6] = {0, 1, 2, 2, 3, 0};
        for (int i = 0; i < 6; ++i) indices[face * 6 + i] = (unsigned int)face * 4 + quad[i];
    }

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

    prog = create_program("shaders/kup.vert", "shaders/kup.frag");
    if (!prog) { glfwTerminate(); return 1; }
    u_mvp = glGetUniformLocation(prog, "uMVP");

    glGenVertexArrays(1, &vao);
    glGenBuffers(1, &vbo);
    glGenBuffers(1, &ebo);
    glBindVertexArray(vao);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof VERTICES, VERTICES, GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof indices, indices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void *)0);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void *)(3 * sizeof(float)));
    glEnableVertexAttribArray(1);
    glBindVertexArray(0);

    glEnable(GL_DEPTH_TEST);
    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);

    while (!glfwWindowShouldClose(win)) {
        int w, h;
        Mat4 proj, view, rx, ry, model, mvp;
        glfwGetFramebufferSize(win, &w, &h);

        /* Sabit açıyla bakılan küp: MVP = P * V * Rx * Ry */
        mat4_perspective(proj, 45.0f * 3.14159265f / 180.0f, h > 0 ? (float)w / (float)h : 1.0f, 0.1f, 10.0f);
        mat4_identity(view);
        view[14] = -3.0f;
        mat4_rotate_x(rx, 25.0f * 3.14159265f / 180.0f);
        mat4_rotate_y(ry, 35.0f * 3.14159265f / 180.0f);
        mat4_mul(model, rx, ry);
        mat4_mul(mvp, view, model);
        mat4_mul(mvp, proj, mvp);

        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        glUseProgram(prog);
        glUniformMatrix4fv(u_mvp, 1, GL_FALSE, mvp);
        glBindVertexArray(vao);
        glDrawElements(GL_TRIANGLES, 36, GL_UNSIGNED_INT, 0);

        if (test_frames > 0 && ++frame >= test_frames) {
            unsigned char px[3];
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
