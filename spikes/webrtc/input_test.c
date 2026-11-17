/* Faz 7 girdi testi: dönen üçgen + klavye/fare olaylarını stdout'a yazar. */
#include <GL/freeglut.h>
#include <stdio.h>

static float angle = 0.0f;
static float tint = 0.0f;

static void display(void)
{
    glClear(GL_COLOR_BUFFER_BIT);
    glLoadIdentity();
    glRotatef(angle, 0, 0, 1);
    glBegin(GL_TRIANGLES);
        glColor3f(1.0f, tint, 0.0f); glVertex2f(-0.6f, -0.5f);
        glColor3f(0.0f, 1.0f, tint); glVertex2f( 0.6f, -0.5f);
        glColor3f(tint, 0.0f, 1.0f); glVertex2f( 0.0f,  0.6f);
    glEnd();
    glutSwapBuffers();
}

static void timer(int v)
{
    if (glutGetWindow() == 0) return;
    angle += 1.0f;
    glutPostRedisplay();
    glutTimerFunc(16, timer, v);
}

static void keyboard(unsigned char key, int x, int y)
{
    (void)x; (void)y;
    printf("KEY %c\n", key);
    tint = tint > 0.5f ? 0.0f : 1.0f; /* görsel geri bildirim */
}

static void mouse(int button, int state, int x, int y)
{
    if (button == GLUT_LEFT_BUTTON && state == GLUT_DOWN) printf("CLICK %d %d\n", x, y);
}

int main(int argc, char **argv)
{
    setvbuf(stdout, NULL, _IONBF, 0);
    glutInit(&argc, argv);
    glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGBA);
    glutInitWindowSize(800, 600);
    glutCreateWindow("OpenGL Web IDE - Girdi");
    glutSetOption(GLUT_ACTION_ON_WINDOW_CLOSE, GLUT_ACTION_GLUTMAINLOOP_RETURNS);
    glClearColor(0.1f, 0.1f, 0.12f, 1.0f);
    glutDisplayFunc(display);
    glutKeyboardFunc(keyboard);
    glutMouseFunc(mouse);
    glutTimerFunc(16, timer, 0);
    glutMainLoop();
    return 0;
}
