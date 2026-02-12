export function AboutPage() {
  return (
    <div className="flex-1 flex flex-col bg-[#FAF8F4]">
      <div className="border-b border-[#D5CBBE] bg-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl text-[#2F342E]">
            Interactive Manim Video Generator
          </h1>
          <p className="text-[#5A625A] mt-1">
            Turn ideas into animated math & science videos — automatically.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Introduction */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">Introduction</h2>
            <p className="text-[#5A625A] leading-relaxed">
              Type a natural-language prompt, get a Manim animation script, and
              receive a rendered video that visually explains your prompt — if
              the prompt is grammatically clear and describes something
              renderable.
            </p>
          </div>

          {/* Overview */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">Overview</h2>
            <p className="text-[#5A625A] leading-relaxed">
              This project converts clear, well-formed natural-language prompts
              into short, narrated or purely visual animations using Manim
              (Mathematical Animation Engine). A language model translates the
              user prompt into Manim Python code, the backend validates and
              renders that code to a video, and the final video is delivered
              back to the user. The goal is to make technical concepts (math,
              algorithms, geometry, etc.) instantly explorable with
              high-quality, programmatic animations.
            </p>
          </div>

          {/* What is Manim */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">What is Manim</h2>
            <p className="text-[#5A625A] leading-relaxed">
              Manim is an open-source Python library for programmatic animations
              — it&apos;s what we use to turn code into precise, repeatable
              visuals. Because Manim expresses visuals as code, it&apos;s ideal
              for generating mathematically accurate diagrams, animated
              step-by-step explanations, and clean instructional videos. In this
              project, Manim acts as the rendering engine: the model writes
              Manim code, and Manim produces the final animation frames which we
              package into a video.
            </p>
          </div>

          {/* How Manim is integrated */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">
              How Manim is integrated in this project
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-[#2F342E]">Prompt → Model</h3>
                <p className="text-[#5A625A]">
                  The user submits a textual prompt describing the concept to
                  visualize.
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-[#2F342E]">Model → Manim code</h3>
                <p className="text-[#5A625A]">
                  A language model (fine-tuned/structured for this task)
                  generates a Manim Python script that implements the requested
                  animation.
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-[#2F342E]">Validation & Safety</h3>
                <p className="text-[#5A625A]">
                  The generated script runs through linting, sandboxed syntax
                  checks, and resource-safety checks (timeouts, CPU/GPU limits,
                  banned operations).
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-[#2F342E]">Render</h3>
                <p className="text-[#5A625A]">
                  Validated scripts are executed by Manim in a controlled
                  environment. Frames are encoded and assembled into a video
                  (e.g., with FFmpeg).
                </p>
              </div>
              <div>
                <h3 className="mb-2 text-[#2F342E]">Deliver</h3>
                <p className="text-[#5A625A]">
                  The final video is stored and returned to the user for
                  playback or download.
                </p>
              </div>
              <p className="text-[#5A625A] leading-relaxed mt-4">
                This pipeline keeps the user experience simple while preserving
                the expressive power of Manim behind the scenes.
              </p>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">How It Works</h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#546F54] text-[#F7F8F7] rounded-full flex items-center justify-center">
                  1
                </div>
                <div>
                  <h3 className="mb-1 text-[#2F342E]">Enter a prompt</h3>
                  <p className="text-[#5A625A] mb-2">
                    Example: &quot;Show gradient descent on f(x) = x²: draw the
                    loss curve, a red dot representing the parameter, a tangent
                    line at the dot, and animate steps of the update rule for 6
                    iterations.&quot;
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#546F54] text-[#F7F8F7] rounded-full flex items-center justify-center">
                  2
                </div>
                <div>
                  <h3 className="mb-1 text-[#2F342E]">
                    Model generates Manim code
                  </h3>
                  <p className="text-[#5A625A]">
                    The backend translates your prompt into a Manim script that
                    implements the requested visuals and annotations.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#546F54] text-[#F7F8F7] rounded-full flex items-center justify-center">
                  3
                </div>
                <div>
                  <h3 className="mb-1 text-[#2F342E]">
                    Validation & safety checks
                  </h3>
                  <p className="text-[#5A625A]">
                    The script is automatically validated for syntax,
                    sandbox-safety, and render feasibility.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#546F54] text-[#F7F8F7] rounded-full flex items-center justify-center">
                  4
                </div>
                <div>
                  <h3 className="mb-1 text-[#2F342E]">Render to video</h3>
                  <p className="text-[#5A625A]">
                    If validation passes, Manim renders the animation and we
                    package frames into a single video file.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-[#546F54] text-[#F7F8F7] rounded-full flex items-center justify-center">
                  5
                </div>
                <div>
                  <h3 className="mb-1 text-[#2F342E]">Download or view</h3>
                  <p className="text-[#5A625A]">
                    You receive the final video plus the Manim code used to
                    generate it. You can re-run, modify the prompt, or edit the
                    code directly.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Edge Behavior */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">Edge Behavior</h2>
            <div className="space-y-3">
              <p className="text-[#5A625A]">
                If the prompt is ambiguous, the UI will either (a) show the
                model&apos;s interpretation and ask for confirmation, or (b)
                return a short error message explaining what to clarify.
              </p>
              <p className="text-[#5A625A]">
                If the generated code fails validation, you&apos;ll get a
                helpful message with the failing check and an editable preview
                of the code so you can tweak and re-render.
              </p>
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-xl border border-[#D5CBBE] p-6">
            <h2 className="text-2xl mb-4 text-[#2F342E]">FAQ</h2>
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: What kind of prompts work best?
                </h3>
                <p className="text-[#5A625A]">
                  A: Clear, concrete prompts describing visual elements work
                  best. Specify functions/ranges, objects (dots, arrows, axes),
                  and animation behavior (move along, fade in/out, number of
                  steps). Avoid vague metaphors like &quot;show how success
                  grows&quot; — instead request a chart or curve with concrete
                  labels.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: Which Manim features are supported?
                </h3>
                <p className="text-[#5A625A]">
                  A: Core 2D animations (axes, plots, dots, vectors, labels,
                  transforms, camera moves) and standard scene primitives are
                  supported. Complex 3D scenes or experimental Manim plugins may
                  be restricted depending on renderer capabilities.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: Can I add narration / text-to-speech?
                </h3>
                <p className="text-[#5A625A]">
                  A: Yes — you can supply narration text. The system can
                  optionally synthesize audio and combine it with the video,
                  subject to voice options and TTS availability.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: How long will the video be?
                </h3>
                <p className="text-[#5A625A]">
                  A: You can request a target duration in the prompt. Otherwise
                  the renderer uses a default (short demo length). Very long
                  videos or very high frame counts may be automatically
                  shortened or fail validation.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: Is my prompt or generated code private?
                </h3>
                <p className="text-[#5A625A]">
                  A: Prompts and generated code are stored according to the
                  project&apos;s privacy policy. By default (changeable in
                  settings), short-lived storage is used for rendering; you can
                  opt to save or delete your generated scripts and videos.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: What if the generated code fails to run?
                </h3>
                <p className="text-[#5A625A]">
                  A: The system reports the failing check and shows the
                  problematic code section. You can edit the code in the UI or
                  refine your prompt. We also provide sample prompts and
                  templates to guide you.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: Can I edit the Manim code before rendering?
                </h3>
                <p className="text-[#5A625A]">
                  A: Yes. After the model generates code, you can open an
                  editable editor, modify the script, and re-run rendering — all
                  within the same validation and sandbox pipeline.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: What about safety — could the model output malicious code?
                </h3>
                <p className="text-[#5A625A]">
                  A: Generated scripts are subject to static and runtime checks;
                  network/file operations and dangerous system calls are
                  blocked. Rendering always occurs in a sandbox with strict
                  resource and permission limits.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">
                  Q: What are common failure modes?
                </h3>
                <p className="text-[#5A625A]">
                  A: Ambiguous prompts, requests for unsupported features
                  (complex 3D simulations, heavy external data fetches), or
                  prompts that imply file I/O/network access. These produce
                  helpful error messages explaining the cause.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-[#2F342E]">Q: Who is this for?</h3>
                <p className="text-[#5A625A]">
                  A: Educators, students, content creators, and developers who
                  want quick, programmatic visual explanations without manually
                  writing animation code.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
