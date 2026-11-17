/* OpenGL Web IDE tarayıcı çalışma ortamı: GLU taklidi (runtime/gl.js). */
#ifndef OGLIDE_GLU_H
#define OGLIDE_GLU_H
#include <GL/gl.h>

#ifdef __cplusplus
extern "C" {
#endif

void gluOrtho2D(GLdouble left, GLdouble right, GLdouble bottom, GLdouble top);
void gluPerspective(GLdouble fovy, GLdouble aspect, GLdouble zNear, GLdouble zFar);

#ifdef __cplusplus
}
#endif
#endif
