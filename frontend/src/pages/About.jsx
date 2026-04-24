export default function About() {
  return (
    <div className="aboutPage">
      <h1 className="aboutTitle">About</h1>

      <section className="aboutSection">
        <h2 className="aboutHeading">Interactive Manim Video Generator</h2>
        <p className="aboutParagraph">
          Turn ideas into animated math & machine learning videos —
          automatically! Interactive Manim Video Generator is a system that
          transforms structured natural-language prompts into animated
          educational videos using Manim, the Mathematical Animation Engine.
          Instead of manually writing animation scripts, users describe what
          they want to visualize — such as a mathematical function, an
          algorithm, or a geometric concept — and the system automatically
          generates the corresponding Manim Python code, validates it for
          safety, renders it in a sandboxed environment, and returns a playable
          video. The goal of this project is to make technical and mathematical
          concepts instantly explorable through clean, programmatic animations.
          By combining language models with deterministic rendering through
          Manim, the platform enables educators, students, and developers to
          create high-quality visual explanations without deep animation
          expertise. The system ensures reliability through structured code
          generation, validation checks, resource limits, and controlled
          rendering workflows. Users can also inspect and modify the generated
          Manim code before re-rendering, giving both automation and flexibility
          in one workflow.
        </p>
      </section>

      <section className="faqSection">
        <h2 className="faqHeading">FAQs</h2>

        <div className="faqList">
          <div className="faqItem">
            <h3 className="faqQuestion">Q: What kind of prompts work best?</h3>
            <p className="faqAnswer">
              A: Clear, specific, and visual prompts work best. Describe the
              objects (axes, curves, dots, vectors), their behavior (move,
              transform, fade), and any constraints like number of steps or
              iterations. Avoid abstract metaphors; instead describe concrete
              visual elements.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">
              Q: Which Manim features are supported?
            </h3>
            <p className="faqAnswer">
              A: Core 2D animations such as axes, function plots, text labels,
              arrows, vectors, transformations, and camera movements are
              supported. Complex 3D scenes or experimental plugins may be
              restricted depending on rendering capabilities.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">Q: How long will the video be?</h3>
            <p className="faqAnswer">
              A: You may specify a target duration in your prompt. Otherwise, a
              default short demo length is used. Very long or high-frame-count
              requests may be shortened or fail validation to maintain system
              stability.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">
              Q: Is my prompt or generated code private?
            </h3>
            <p className="faqAnswer">
              A: Prompts and generated scripts are handled according to the
              project’s storage policy. By default, temporary storage is used
              for rendering, and users can choose whether to save or delete
              generated content.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">Q: What are common failure cases?</h3>
            <p className="faqAnswer">
              A: Ambiguous prompts, unsupported advanced 3D simulations, or
              requests involving external data access may fail validation. In
              such cases, the system provides clear error feedback.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">
              Q: Who is this platform designed for?
            </h3>
            <p className="faqAnswer">
              A: Educators, students, researchers, developers, and content
              creators who want to generate structured visual explanations
              quickly without manually writing animation scripts.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
