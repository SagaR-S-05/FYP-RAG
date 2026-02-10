from manim import *

class Test(Scene):
    def construct(self):
        c = Circle()
        self.play(Create(c))
        self.wait(1)
