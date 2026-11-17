/* OpenGL Web IDE tarayıcı çalışma ortamı: FreeGLUT taklidi. Pencere = sayfadaki <canvas>.
 * glutMainLoop() geri dönmez gibi davranır; olay döngüsünü tarayıcı yürütür (runtime/glut.js). */
#ifndef OGLIDE_FREEGLUT_H
#define OGLIDE_FREEGLUT_H
#include <GL/gl.h>
#include <GL/glu.h>

#ifdef __cplusplus
extern "C" {
#endif

#define GLUT_RGB 0x0000
#define GLUT_RGBA 0x0000
#define GLUT_SINGLE 0x0000
#define GLUT_DOUBLE 0x0002
#define GLUT_DEPTH 0x0010

#define GLUT_LEFT_BUTTON 0x0000
#define GLUT_MIDDLE_BUTTON 0x0001
#define GLUT_RIGHT_BUTTON 0x0002
#define GLUT_DOWN 0x0000
#define GLUT_UP 0x0001

#define GLUT_ACTION_ON_WINDOW_CLOSE 0x01F9
#define GLUT_ACTION_EXIT 0
#define GLUT_ACTION_GLUTMAINLOOP_RETURNS 1
#define GLUT_ACTION_CONTINUE_EXECUTION 2
#define GLUT_COMPATIBILITY_PROFILE 0x0002
#define GLUT_CORE_PROFILE 0x0001

#define GLUT_WINDOW_WIDTH 0x0066
#define GLUT_WINDOW_HEIGHT 0x0067
#define GLUT_ELAPSED_TIME 0x02BC

void glutInit(int *argc, char **argv);
void glutInitDisplayMode(unsigned int mode);
void glutInitWindowSize(int width, int height);
void glutInitWindowPosition(int x, int y);
void glutInitContextVersion(int major, int minor);
void glutInitContextProfile(int profile);
int glutCreateWindow(const char *title);
void glutSetOption(GLenum what, int value);
int glutGetWindow(void);
int glutGet(GLenum what);

void glutDisplayFunc(void (*callback)(void));
void glutReshapeFunc(void (*callback)(int width, int height));
void glutTimerFunc(unsigned int msecs, void (*callback)(int value), int value);
void glutIdleFunc(void (*callback)(void));
void glutKeyboardFunc(void (*callback)(unsigned char key, int x, int y));
void glutMouseFunc(void (*callback)(int button, int state, int x, int y));

void glutPostRedisplay(void);
void glutSwapBuffers(void);
void glutMainLoop(void);
void glutLeaveMainLoop(void);

#ifdef __cplusplus
}
#endif
#endif
