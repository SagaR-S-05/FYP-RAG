import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { SidebarProvider } from "./components/sidebar.jsx";
import { SessionProvider } from "./sessionContext.jsx";

createRoot(document.getElementById("root")).render(
  <SidebarProvider>
    <SessionProvider>
      <App />
    </SessionProvider>
  </SidebarProvider>
);

