import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import App from "./App";
import { CameraProvider } from "./contexts/CameraContext";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <CameraProvider>
      <App />
    </CameraProvider>
  </React.StrictMode>
);
