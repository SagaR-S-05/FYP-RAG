export default function About() {
  return (
    <div className="aboutPage">
      <h1 className="aboutTitle">About</h1>

      <section className="aboutSection">
        <h2 className="aboutHeading">Interactive Manim Video Generator</h2>
        <p className="aboutParagraph">
         Turn ideas into animated math & machine learning videos — automatically.
        </p>
      </section>

      <section className="faqSection">
        <h2 className="faqHeading">FAQs</h2>

        <div className="faqList">
          <div className="faqItem">
            <h3 className="faqQuestion">This is a placeholder question?</h3>
            <p className="faqAnswer">
              This is a placeholder answer that will be replaced later.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">This is a placeholder question?</h3>
            <p className="faqAnswer">
              This is a placeholder answer that will be replaced later.
            </p>
          </div>

          <div className="faqItem">
            <h3 className="faqQuestion">This is a placeholder question?</h3>
            <p className="faqAnswer">
              This is a placeholder answer that will be replaced later.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

