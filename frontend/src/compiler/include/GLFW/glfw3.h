/* OpenGL Web IDE tarayıcı çalışma ortamı: GLFW 3 taklidi. Pencere = sayfadaki <canvas>.
 * glfwSwapBuffers bir kare bekler (tarayıcıya döner, sonra devam eder): while döngülü programlar sayfayı
 * dondurmadan çalışır. Fonksiyon gövdeleri JavaScript'tedir (runtime/glfw.ts). */
#ifndef OGLIDE_GLFW3_H
#define OGLIDE_GLFW3_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct GLFWwindow GLFWwindow;
typedef struct GLFWmonitor GLFWmonitor;
typedef void (*GLFWglproc)(void);
typedef void (*GLFWerrorfun)(int error_code, const char *description);
typedef void (*GLFWframebuffersizefun)(GLFWwindow *window, int width, int height);
typedef void (*GLFWkeyfun)(GLFWwindow *window, int key, int scancode, int action, int mods);
typedef void (*GLFWmousebuttonfun)(GLFWwindow *window, int button, int action, int mods);
typedef void (*GLFWcursorposfun)(GLFWwindow *window, double xpos, double ypos);

#define GLFW_TRUE 1
#define GLFW_FALSE 0
#define GLFW_RELEASE 0
#define GLFW_PRESS 1
#define GLFW_REPEAT 2

#define GLFW_CONTEXT_VERSION_MAJOR 0x00022002
#define GLFW_CONTEXT_VERSION_MINOR 0x00022003
#define GLFW_OPENGL_PROFILE 0x00022008
#define GLFW_OPENGL_FORWARD_COMPAT 0x00022006
#define GLFW_OPENGL_CORE_PROFILE 0x00032001
#define GLFW_OPENGL_COMPAT_PROFILE 0x00032002
#define GLFW_RESIZABLE 0x00020003
#define GLFW_VISIBLE 0x00020004
#define GLFW_SAMPLES 0x0002100D

#define GLFW_MOUSE_BUTTON_LEFT 0
#define GLFW_MOUSE_BUTTON_RIGHT 1
#define GLFW_MOUSE_BUTTON_MIDDLE 2

#define GLFW_KEY_SPACE 32
#define GLFW_KEY_0 48
#define GLFW_KEY_9 57
#define GLFW_KEY_A 65
#define GLFW_KEY_D 68
#define GLFW_KEY_R 82
#define GLFW_KEY_S 83
#define GLFW_KEY_W 87
#define GLFW_KEY_Z 90
#define GLFW_KEY_ESCAPE 256
#define GLFW_KEY_ENTER 257
#define GLFW_KEY_RIGHT 262
#define GLFW_KEY_LEFT 263
#define GLFW_KEY_DOWN 264
#define GLFW_KEY_UP 265

int glfwInit(void);
void glfwTerminate(void);
GLFWerrorfun glfwSetErrorCallback(GLFWerrorfun callback);
void glfwWindowHint(int hint, int value);
GLFWwindow *glfwCreateWindow(int width, int height, const char *title, GLFWmonitor *monitor, GLFWwindow *share);
void glfwDestroyWindow(GLFWwindow *window);
void glfwMakeContextCurrent(GLFWwindow *window);
GLFWglproc glfwGetProcAddress(const char *procname);
void glfwSwapInterval(int interval);
void glfwSwapBuffers(GLFWwindow *window);
void glfwPollEvents(void);
int glfwWindowShouldClose(GLFWwindow *window);
void glfwSetWindowShouldClose(GLFWwindow *window, int value);
void glfwSetWindowTitle(GLFWwindow *window, const char *title);
void glfwGetFramebufferSize(GLFWwindow *window, int *width, int *height);
void glfwGetWindowSize(GLFWwindow *window, int *width, int *height);
double glfwGetTime(void);
int glfwGetKey(GLFWwindow *window, int key);
int glfwGetMouseButton(GLFWwindow *window, int button);
void glfwGetCursorPos(GLFWwindow *window, double *xpos, double *ypos);
GLFWframebuffersizefun glfwSetFramebufferSizeCallback(GLFWwindow *window, GLFWframebuffersizefun callback);
GLFWkeyfun glfwSetKeyCallback(GLFWwindow *window, GLFWkeyfun callback);
GLFWmousebuttonfun glfwSetMouseButtonCallback(GLFWwindow *window, GLFWmousebuttonfun callback);
GLFWcursorposfun glfwSetCursorPosCallback(GLFWwindow *window, GLFWcursorposfun callback);

#ifdef __cplusplus
}
#endif
#endif
