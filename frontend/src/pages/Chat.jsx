import { useState, useRef, useEffect } from "react";
import { ArrowUp, Save } from "lucide-react";
import { useSessions } from "../sessionContext.jsx";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const stages = [
  { name: "Analyzing Prompt", duration: 5000 },
  { name: "Generating Code", duration: 8000 },
  { name: "Code Ready", duration: 4000 },
  { name: "Rendering Frames", duration: 20000 },
  { name: "Finalizing Video", duration: 8000 },
  { name: "Complete", duration: 0 },
];

const stageSoftCaps = {
  "Analyzing Prompt": 88,
  "Generating Code": 92,
  "Code Ready": 100,
  "Rendering Frames": 94,
  "Finalizing Video": 90,
  Complete: 100,
};

const stageSmoothStep = {
  "Analyzing Prompt": 3,
  "Generating Code": 1.4,
  "Code Ready": 8,
  "Rendering Frames": 0.8,
  "Finalizing Video": 1.8,
  Complete: 0,
};

const defaultStageStatus = stages.map(() => "pending");

function createGenerationState(overrides = {}) {
  return {
    loading: false,
    isAnimating: false,
    composerLeaving: false,
    currentStageIndex: -1,
    stageProgress: 0,
    stageStatus: defaultStageStatus,
    ...overrides,
  };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalizedPath}`;
  }
  return `/api${normalizedPath}`;
}

function extractGalleryVideoId(videoPath) {
  if (!videoPath) return null;
  const clean = String(videoPath).trim().replace(/\\/g, "/").split("?")[0].split("#")[0];
  const renderedIndex = clean.toLowerCase().lastIndexOf("rendered_videos/");
  if (renderedIndex >= 0) {
    return clean.slice(renderedIndex + "rendered_videos/".length).replace(/^\/+/, "");
  }
  const fileName = clean.split("/").filter(Boolean).pop();
  return fileName && fileName.toLowerCase().endsWith(".mp4") ? fileName : null;
}

function resolveVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  let normalized = String(videoUrl).trim().replace(/\\/g, "/");

  if (/^https?:\/\//i.test(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const renderedIndex = lower.lastIndexOf("rendered_videos/");
  if (renderedIndex >= 0) {
    normalized = `/${normalized.slice(renderedIndex)}`;
  } else if (/^[^/]+\.mp4$/i.test(normalized)) {
    normalized = `/rendered_videos/${normalized}`;
  } else {
    normalized = normalized.startsWith("/") ? normalized : `/${normalized}`;
  }

  if (normalized.startsWith("/api/rendered_videos/")) {
    normalized = normalized.replace(/^\/api/, "");
  }

  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalized}`;
  }

  return normalized;
}

function buildVideoCandidates(videoPath, dbVideoId = null, dbPromptId = null) {
  if (!videoPath && !dbVideoId && !dbPromptId) return [];

  const raw = String(videoPath || "").trim().replace(/\\/g, "/");
  if (raw && /^https?:\/\//i.test(raw)) return [raw];

  const clean = raw ? raw.split("?")[0].split("#")[0] : "";
  const fileName = clean.split("/").filter(Boolean).pop() || "";

  let relativePath = clean;
  const renderedIndex = clean
    ? clean.toLowerCase().lastIndexOf("rendered_videos/")
    : -1;
  if (renderedIndex >= 0 && clean) {
    relativePath = `/${clean.slice(renderedIndex)}`;
  } else if (clean && /^[^/]+\.mp4$/i.test(clean)) {
    relativePath = `/rendered_videos/${clean}`;
  } else {
    relativePath = clean.startsWith("/") ? clean : `/${clean}`;
  }

  if (relativePath.startsWith("/api/rendered_videos/")) {
    relativePath = relativePath.replace(/^\/api/, "");
  }

  const renderedPathFromFile = fileName
    ? `/rendered_videos/${fileName}`
    : null;

  const candidates = [
    clean ? resolveVideoUrl(relativePath) : null,
    renderedPathFromFile ? resolveVideoUrl(renderedPathFromFile) : null,
    dbVideoId ? resolveVideoUrl(`/rendered_videos/${dbVideoId}.mp4`) : null,
    dbPromptId ? resolveVideoUrl(`/rendered_videos/${dbPromptId}.mp4`) : null,
    clean && API_BASE_URL ? `${API_BASE_URL}${relativePath}` : null,
    API_BASE_URL && renderedPathFromFile
      ? `${API_BASE_URL}${renderedPathFromFile}`
      : null,
    API_BASE_URL && dbVideoId
      ? `${API_BASE_URL}/rendered_videos/${dbVideoId}.mp4`
      : null,
    API_BASE_URL && dbPromptId
      ? `${API_BASE_URL}/rendered_videos/${dbPromptId}.mp4`
      : null,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function canLoadVideoUrl(url) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;

    if (head.status === 405) {
      const probe = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
      });
      return probe.ok || probe.status === 206;
    }
  } catch (_) {
    return false;
  }

  return false;
}

async function findLoadableVideoUrl(videoPath, dbVideoId = null, dbPromptId = null) {
  const candidates = buildVideoCandidates(videoPath, dbVideoId, dbPromptId);

  for (const candidate of candidates) {
    const ok = await canLoadVideoUrl(candidate);
    if (ok) return candidate;
  }

  return candidates[0] || null;
}

async function validateDomain(userPrompt) {
  const response = await fetch(buildApiUrl("/validate-domain"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: userPrompt }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || data?.error || "Could not validate prompt.");
  }

  if (!data?.allowed) {
    throw new Error(
      data?.message ||
        "I can only generate Math, Machine Learning, or Deep Learning visualizations."
    );
  }
}

function getPromptTopic(userPrompt) {
  const cleaned = userPrompt
    .replace(/^(visualize|show|animate|demonstrate|illustrate|create|plot|draw)\s+/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();

  return cleaned || userPrompt.trim() || "this concept";
}

function buildInsightPlaceholder(userPrompt, index = 0) {
  const normalized = userPrompt.toLowerCase();
  let facts = [];

  if (normalized.includes("cross product")) {
    facts = [
      "The cross product is unique to three-dimensional vectors and points perpendicular to the plane made by the inputs.",
      "The right-hand rule is the classic memory trick: curl your fingers from the first vector to the second, and your thumb gives the result.",
      "The cross product's length equals the area of the parallelogram spanned by the two vectors.",
      "Swapping the order flips the result: a cross b points opposite to b cross a."
    ];
  } else if (normalized.includes("dot product")) {
    facts = [
      "The dot product links algebra and geometry: it measures how much one vector points in another vector's direction.",
      "A dot product of zero means the two vectors are perpendicular.",
      "The dot product can be written as a multiplication of magnitudes and the cosine of the angle between vectors."
    ];
  } else if (normalized.includes("vector")) {
    facts = [
      "The term vector comes from a Latin root meaning to carry, which fits the idea of a quantity with direction.",
      "A vector keeps its magnitude and direction even if you slide it to a different starting point.",
      "Basis vectors act like building blocks: other vectors can be assembled from scaled basis directions."
    ];
  } else if (normalized.includes("gradient") || normalized.includes("optimization")) {
    facts = [
      "Gradient descent became a workhorse of modern ML because it turns learning into repeated small corrections.",
      "The gradient points toward steepest increase, so descent moves in the opposite direction.",
      "Small learning rates move carefully; large learning rates can overshoot the minimum."
    ];
  } else if (normalized.includes("regression")) {
    facts = [
      "Regression traces back to Francis Galton's 19th-century statistics work, long before modern machine learning.",
      "In ML, regression predicts continuous values, while classification predicts discrete labels.",
      "Linear regression chooses a line by minimizing the total squared prediction error."
    ];
  } else if (normalized.includes("feedforward") || normalized.includes("forward propagation")) {
    facts = [
      "A feedforward neural network moves information in one direction: input layer, hidden layers, then output layer.",
      "Forward propagation is just repeated matrix multiplication plus activation functions.",
      "Hidden layers learn intermediate features, so later layers can combine simpler patterns into richer ones."
    ];
  } else if (normalized.includes("neural") || normalized.includes("perceptron")) {
    facts = [
      "The perceptron was introduced by Frank Rosenblatt in 1958 and helped shape early neural-network research.",
      "Modern neural networks learn by adjusting many small weights so simple units compose into complex behavior.",
      "Activation functions let neural networks model nonlinear patterns instead of only straight-line relationships."
    ];
  } else if (normalized.includes("probability") || normalized.includes("bayes")) {
    facts = [
      "Bayes' theorem is named after Thomas Bayes and became central to probabilistic reasoning and ML.",
      "A probability distribution assigns total mass of one across all possible outcomes.",
      "Bayesian reasoning updates belief by combining prior knowledge with new evidence."
    ];
  } else if (normalized.includes("matrix") || normalized.includes("linear algebra")) {
    facts = [
      "Matrices can represent transformations like rotation, scaling, shearing, and projection.",
      "Matrix multiplication composes transformations: applying one transformation after another.",
      "Eigenvectors are special directions that a matrix stretches or shrinks without rotating."
    ];
  } else if (normalized.includes("calculus") || normalized.includes("derivative")) {
    facts = [
      "A derivative measures instantaneous rate of change, like slope at a single point.",
      "Newton and Leibniz independently developed calculus notation and ideas in the 17th century.",
      "In optimization, derivatives tell us which direction changes a function fastest."
    ];
  } else {
    facts = [
      "Mathematical models often turn relationships into equations so patterns can be reasoned about precisely.",
      "In machine learning, features are the measurable inputs a model uses to make predictions.",
      "Many ML algorithms can be understood as searching for parameters that reduce error."
    ];
  }

  return `Preparing a quick insight...\n\n${facts[index % facts.length]}`;
}

function buildComposerExitMessage(userPrompt) {
  const options = [
    "On it!",
    "Get ready.",
    "Warming up the renderer.",
    "Turning the idea into motion.",
  ];
  const topic = getPromptTopic(userPrompt).toLowerCase();
  if (topic.includes("vector")) return "Locking in the vectors.";
  if (topic.includes("gradient")) return "Following the slope.";
  if (topic.includes("neural")) return "Firing up the layers.";
  return options[Math.floor(Math.random() * options.length)];
}

async function fetchVideoFromDb(promptText) {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("videos")
    .select(`
      id,
      video_url,
      created_at,
      prompt_id,
      prompts (
        prompt_text
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const normalizedPrompt = promptText.trim().toLowerCase();
  const matchingVideo = data.find(
    (row) => {
      const promptRelation = Array.isArray(row?.prompts)
        ? row.prompts[0]
        : row?.prompts;
      const promptValue = promptRelation?.prompt_text?.trim().toLowerCase();
      return promptValue === normalizedPrompt;
    }
  );

  return matchingVideo || data[0] || null;
}

export default function Chat() {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState(null);
  const [generationBySession, setGenerationBySession] = useState({});
  const {
    activeSession,
    activeSessionId,
    addMessageToSession,
    updateMessageInSession,
    updateMessageInActiveSession,
  } = useSessions();
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [savingGalleryId, setSavingGalleryId] = useState(null);

  // Determine if the current session has zero messages
  const isEmptySession =
    !!activeSession &&
    (!activeSession.messages || activeSession.messages.length === 0);

  const activeGeneration =
    generationBySession[activeSessionId] || createGenerationState();
  const loading = activeGeneration.loading;
  const isAnimating = activeGeneration.isAnimating;
  const composerLeaving = activeGeneration.composerLeaving;
  const composerExitMessage = activeGeneration.composerExitMessage || "On it!";
  const currentStageIndex = activeGeneration.currentStageIndex;
  const stageProgress = activeGeneration.stageProgress;
  const stageStatus = activeGeneration.stageStatus;

  const setSessionGeneration = (sessionId, patch) => {
    setGenerationBySession((prev) => ({
      ...prev,
      [sessionId]: createGenerationState({
        ...(prev[sessionId] || {}),
        ...patch,
      }),
    }));
  };

  const applyBackendProgress = (sessionId, stageName, progressValue = 0) => {
    const stageIndex = stages.findIndex((stage) => stage.name === stageName);
    if (stageIndex < 0) return;

    setSessionGeneration(sessionId, {
      currentStageIndex: stageIndex,
      stageProgress: Math.max(0, Math.min(100, Number(progressValue) || 0)),
      stageStatus: stages.map((_, index) => {
        if (index < stageIndex) return "complete";
        if (index === stageIndex) return progressValue >= 100 ? "complete" : "running";
        return "pending";
      }),
    });
  };

  const generateWithBackendProgress = async (sessionId, userPrompt, onRenderingFrames) => {
    const response = await fetch(buildApiUrl("/generate-stream"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: userPrompt }),
    });

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.detail || data?.error || "Video generation failed.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);

        if (event.type === "progress") {
          applyBackendProgress(sessionId, event.stage, event.progress);
          if (event.stage === "Rendering Frames") {
            onRenderingFrames?.();
          }
        } else if (event.type === "complete") {
          finalData = event.data;
        } else if (event.type === "error") {
          throw new Error(event.error || "Video generation failed.");
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const event = JSON.parse(trailing);
      if (event.type === "progress") {
        applyBackendProgress(sessionId, event.stage, event.progress);
        if (event.stage === "Rendering Frames") {
          onRenderingFrames?.();
        }
      } else if (event.type === "complete") {
        finalData = event.data;
      } else if (event.type === "error") {
        throw new Error(event.error || "Video generation failed.");
      }
    }

    if (!finalData || finalData.status !== "success") {
      throw new Error(finalData?.error || "Video generation failed.");
    }

    return finalData;
  };

  const streamInsightMessage = async (sessionId, messageId, userPrompt) => {
    try {
      const insightResponse = await fetch(
        buildApiUrl(`/insight?prompt=${encodeURIComponent(userPrompt)}`)
      );

      if (!insightResponse.ok || !insightResponse.body) {
        throw new Error("Insight generation failed.");
      }

      const reader = insightResponse.body.getReader();
      const decoder = new TextDecoder();
      let insightText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        insightText += decoder.decode(value, { stream: true });
        updateMessageInSession(sessionId, messageId, {
          text: insightText || "Generating the full insight...",
          quickFact: false,
        });
      }

      insightText += decoder.decode();
      updateMessageInSession(sessionId, messageId, {
        text: insightText.trim() || "Insight could not be generated, but I can still render the video.",
        pending: false,
        quickFact: false,
      });
    } catch (insightErr) {
      console.error("Insight error:", insightErr);
      updateMessageInSession(sessionId, messageId, {
        text: "Insight could not be generated, but I can still render the video.",
        pending: false,
        quickFact: false,
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userPrompt = prompt.trim();
    if (!userPrompt || !activeSession) return;
    const sessionId = activeSession.id;

    addMessageToSession(sessionId, {
      role: "user",
      text: userPrompt,
    });
    setPrompt("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }

    setError(null);
    setSessionGeneration(sessionId, {
      loading: true,
      composerLeaving: true,
      composerExitMessage: buildComposerExitMessage(userPrompt),
      isAnimating: false,
      currentStageIndex: -1,
      stageProgress: 0,
      stageStatus: defaultStageStatus,
    });

    let insightMessageId = null;
    let insightStarted = false;
    let factTimer = null;

    try {
      await validateDomain(userPrompt);

      window.setTimeout(() => {
        setSessionGeneration(sessionId, {
          composerLeaving: false,
        });
      }, 1800);

      setSessionGeneration(sessionId, {
        loading: true,
        isAnimating: true,
        currentStageIndex: 0,
        stageProgress: 0,
        stageStatus: stages.map((_, index) => (index === 0 ? "running" : "pending")),
      });

      insightMessageId = `${sessionId}-insight-${Date.now()}`;
      addMessageToSession(sessionId, {
        id: insightMessageId,
        role: "assistant",
        text: buildInsightPlaceholder(userPrompt, 0),
        pending: true,
        insight: true,
        quickFact: true,
      });

      let factIndex = 0;
      factTimer = window.setInterval(() => {
        factIndex += 1;
        updateMessageInSession(sessionId, insightMessageId, {
          text: buildInsightPlaceholder(userPrompt, factIndex),
          quickFact: true,
        });
      }, 8000);

      const stopQuickFacts = () => {
        if (!factTimer) return;
        window.clearInterval(factTimer);
        factTimer = null;
      };

      const startInsightWhenRendering = () => {
        if (insightStarted) return;
        insightStarted = true;
        stopQuickFacts();
        updateMessageInSession(sessionId, insightMessageId, {
          text: "Rendering has started. Generating the full insight...",
          quickFact: false,
          pending: true,
        });
        streamInsightMessage(sessionId, insightMessageId, userPrompt);
      };

      const data = await generateWithBackendProgress(
        sessionId,
        userPrompt,
        startInsightWhenRendering
      );

      let videoPath = data?.video_url || null;
      let dbVideoId = null;
      let dbPromptId = null;

      const dbVideo = await fetchVideoFromDb(userPrompt);
      if (dbVideo) {
        if (!videoPath) {
          videoPath = dbVideo.video_url || null;
        }
        dbVideoId = dbVideo.id || null;
        dbPromptId = dbVideo.prompt_id || null;
      }

      if (!videoPath) {
        throw new Error("Video generated, but no video path was found.");
      }

      const resolvedVideoUrl = await findLoadableVideoUrl(videoPath, dbVideoId, dbPromptId);
      if (!resolvedVideoUrl) {
        throw new Error("Unable to load video from rendered_videos.");
      }
      const cacheBustedUrl = `${resolvedVideoUrl}${resolvedVideoUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;

      addMessageToSession(sessionId, {
        role: "assistant",
        text: "Your animation is ready.",
        videoUrl: cacheBustedUrl,
        galleryVideoId: extractGalleryVideoId(videoPath),
        galleryName: userPrompt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      console.error("API error:", message);
      setError(message);
      addMessageToSession(sessionId, {
        role: "assistant",
        text: message,
        error: true,
      });
    } finally {
      if (factTimer) {
        window.clearInterval(factTimer);
      }
      if (insightMessageId && !insightStarted) {
        updateMessageInSession(sessionId, insightMessageId, {
          pending: false,
          quickFact: false,
        });
      }
      setSessionGeneration(sessionId, {
        loading: false,
        isAnimating: false,
        composerLeaving: false,
        currentStageIndex: -1,
        stageProgress: 0,
        stageStatus: defaultStageStatus,
      });
    }
  };

  const welcomeMessage = activeSession?.welcomeMessage;

  // Auto-resize textarea: grow from 1 to 4 lines, then enable scroll
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const resize = () => {
      // reset to allow shrink
      ta.style.height = "auto";
      const computed = window.getComputedStyle(ta);
      const lineHeight = parseFloat(computed.lineHeight) || 20;
      const maxHeight = lineHeight * 4; // 4 lines max
      const newHeight = Math.min(ta.scrollHeight, maxHeight);
      ta.style.height = `${newHeight}px`;
      ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    // call on mount and when prompt changes
    resize();
    ta.addEventListener("input", resize);
    return () => ta.removeEventListener("input", resize);
  }, [prompt, activeSession?.id]);

  // Reset text/height when switching sessions
  useEffect(() => {
    setPrompt("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  }, [activeSession?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeSession?.messages, isAnimating, error]);

  useEffect(() => {
    if (!isAnimating || currentStageIndex < 0 || currentStageIndex >= stages.length) {
      return undefined;
    }

    const currentStage = stages[currentStageIndex];
    const status = stageStatus[currentStageIndex];
    if (status !== "running") {
      return undefined;
    }

    const softCap = stageSoftCaps[currentStage.name] ?? 90;
    const step = stageSmoothStep[currentStage.name] ?? 1;

    const id = setInterval(() => {
      setGenerationBySession((prev) => {
        const current = prev[activeSessionId];
        if (!current || !current.isAnimating) return prev;
        const currentProgress = current.stageProgress;
        if (currentProgress >= softCap) return prev;
        const distance = softCap - currentProgress;
        const easing = Math.max(0.12, distance / 120);
        return {
          ...prev,
          [activeSessionId]: {
            ...current,
            stageProgress: Math.min(softCap, currentProgress + step * easing),
          },
        };
      });
    }, 350);

    return () => clearInterval(id);
  }, [activeSessionId, isAnimating, currentStageIndex, stageStatus]);

  const renderStageProgress = () => {
    const hasAnyProgress = isAnimating && stageStatus.some((status) => status !== "pending");

    if (!hasAnyProgress) {
      return null;
    }

    return (
      <div className="stageProgressCard">
        <div className="stageProgressTitle">
          Animation progress
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {stages.map((stage, index) => {
            const status = stageStatus[index];
            const isCurrent = index === currentStageIndex;
            const progressValue =
              status === "complete"
                ? 100
                : isCurrent
                ? stageProgress
                : 0;

            const circleBackground =
              status === "complete"
                ? "var(--primary)"
                : progressValue > 0
                ? `conic-gradient(var(--primary) ${progressValue}%, var(--border) ${progressValue}% 100%)`
                : "var(--card)";

            const circleBorder =
              status === "pending" && progressValue === 0
                ? "1px solid var(--border)"
                : "none";

            return (
              <div
                key={stage.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "999px",
                    background: circleBackground,
                    border: circleBorder,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color:
                      status === "complete"
                        ? "var(--primary-foreground)"
                        : "var(--foreground)",
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "background 0.2s linear",
                  }}
                >
                  {status === "complete" ? "✓" : `${Math.round(progressValue)}%`}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      color: "var(--foreground)",
                    }}
                  >
                    {stage.name}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 4,
                      borderRadius: 999,
                      backgroundColor: "var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${progressValue}%`,
                        backgroundColor: "var(--primary)",
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleSaveToGallery = async (message) => {
    if (!message.galleryVideoId) return;
    setSavingGalleryId(message.id);
    setError(null);

    try {
      const response = await fetch(buildApiUrl("/gallery/save"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_id: message.galleryVideoId,
          name: message.galleryName || "Generated animation",
          folder: "Unsorted",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || "Could not save video to gallery.");
      }
      updateMessageInActiveSession(message.id, {
        gallerySaved: true,
      });
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Could not save video to gallery.";
      setError(messageText);
    } finally {
      setSavingGalleryId(null);
    }
  };

  const renderWorkflowPanel = () => {
    if (!isAnimating) return null;

    const insightMessage = [...(activeSession?.messages || [])]
      .reverse()
      .find((message) => message.insight);
    const progress = renderStageProgress();
    if (!insightMessage && !progress) return null;

    return (
      <div className="generationWorkflow">
        <div className="generationInsightPanel">
          {insightMessage ? (
            renderMessage(insightMessage, { embedded: true })
          ) : (
            <div className="chatBubble chatBubbleAssistant">
              <div className="chatMessageText">Preparing a quick insight...</div>
            </div>
          )}
        </div>
        <div className="generationProgressPanel">{progress}</div>
      </div>
    );
  };

  const renderMessage = (message, options = {}) => {
    const isUser = message.role === "user";
    const messageClassName = isUser
      ? "chatBubble chatBubbleUser"
      : message.error
      ? "chatBubble chatBubbleError"
      : "chatBubble chatBubbleAssistant";
    const isQuickFact = Boolean(message.quickFact);

    return (
      <div
        key={message.id}
        className={`${messageClassName}${options.embedded ? " chatBubbleEmbedded" : ""}${isQuickFact ? " quickFactBubble" : ""}`}
      >
        {message.text && (
          <div key={isQuickFact ? message.text : undefined} className="chatMessageText">
            {message.text}
          </div>
        )}
        {message.pending && !message.insight && <div className="mutedText">Loading...</div>}
        {message.videoUrl && (
          <div className="chatVideoBlock">
            <div className="videoContainer chatMessageVideo">
              <video
                className="generatedVideo"
                controls
                autoPlay
                src={message.videoUrl}
              >
                Your browser does not support the video tag.
              </video>
            </div>
            {message.galleryVideoId && (
              <button
                className="iconTextButton chatSaveButton"
                type="button"
                onClick={() => handleSaveToGallery(message)}
                disabled={message.gallerySaved || savingGalleryId === message.id}
              >
                <Save size={17} />
                {message.gallerySaved
                  ? "Saved to gallery"
                  : savingGalleryId === message.id
                  ? "Saving..."
                  : "Save to gallery"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const shouldShowComposer = !loading && !isAnimating;
  const isSubmitDisabled = !shouldShowComposer || !prompt.trim();
  const renderComposerExit = () => {
    if (!composerLeaving) return null;
    return (
      <div className="composerExit" role="status" aria-live="polite">
        <span>{composerExitMessage}</span>
      </div>
    );
  };

  return (
    <div className="chatPage">
      <div className="chatContainer">
        {/* If session is empty, center welcome + input vertically and horizontally */}
        {isEmptySession ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <div style={{ width: "100%", maxWidth: 900, padding: "1rem" }}>
              {welcomeMessage && (
                <div className="welcomeMessage" style={{ textAlign: "center" }}>
                  {welcomeMessage}
                </div>
              )}

              {shouldShowComposer && (
                <form
                  className="chatForm"
                  onSubmit={handleSubmit}
                  style={{ marginTop: "1rem" }}
                >
                  {renderWorkflowPanel()}
                  <div
                    className="inputWrapper"
                    style={{ display: "flex", justifyContent: "center" }}
                  >
                    <div className="promptComposer">
                      <textarea
                        ref={textareaRef}
                        className="chatInput"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter your prompt here..."
                        rows={1}
                        disabled={!shouldShowComposer}
                        style={{
                          width: "100%",
                          paddingRight: 56,
                          background: "transparent",
                          border: "none",
                          resize: "none",
                          overflowY: "hidden",
                        }}
                      />

                      <button
                        type="submit"
                        aria-label="Send prompt"
                        disabled={isSubmitDisabled}
                        className="promptSubmit"
                      >
                        <ArrowUp size={18} />
                      </button>
                    </div>
                  </div>
                </form>
              )}
              {renderComposerExit()}
            </div>
          </div>
        ) : (
          <>
            <div className="chatMessages">
              {welcomeMessage && (
                <div className="welcomeMessage">{welcomeMessage}</div>
              )}

              {activeSession?.messages
                ?.filter((message) => !(isAnimating && message.insight))
                .map((message) => renderMessage(message))}

              {renderWorkflowPanel()}

              <div ref={messagesEndRef} />
            </div>

            {shouldShowComposer && (
              <form className="chatForm" onSubmit={handleSubmit}>
                <div className="inputWrapper">
                  <div className="promptComposer">
                    <textarea
                      ref={textareaRef}
                      className="chatInput"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Enter your prompt here..."
                      rows={1}
                      disabled={!shouldShowComposer}
                      style={{
                        width: "100%",
                        paddingRight: 56,
                        background: "transparent",
                        border: "none",
                        resize: "none",
                        overflowY: "hidden",
                      }}
                    />

                    <button
                      type="submit"
                      aria-label="Send prompt"
                      disabled={isSubmitDisabled}
                      className="promptSubmit"
                    >
                      <ArrowUp size={18} />
                    </button>
                  </div>
                </div>
              </form>
            )}
            {renderComposerExit()}
          </>
        )}
      </div>
    </div>
  );
}
