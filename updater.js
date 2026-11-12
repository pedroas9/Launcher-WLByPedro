"use strict";

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

const RETRASO_INICIO_MS = 4000;
const CANAL_IPC = "actualizacion-evento";

let hayVentanasJuego = () => false;
let actualizacionLista = false;
let ipcListo = false;

function enviarALogin(payload) {
  for (const ventana of BrowserWindow.getAllWindows()) {
    if (ventana.isDestroyed()) continue;
    const url = ventana.webContents.getURL();
    if (url.includes("index.html")) {
      ventana.webContents.send(CANAL_IPC, payload);
    }
  }
}

async function instalarAhora() {
  if (hayVentanasJuego()) {
    await dialog.showMessageBox({
      type: "warning",
      title: "Actualización",
      message:
        "Cierra todas las ventanas del juego antes de reiniciar e instalar la actualización.",
    });
    return false;
  }
  if (!actualizacionLista) return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
}

async function avisoActualizacionLista(info) {
  enviarALogin({
    estado: "downloaded",
    version: info && info.version ? info.version : "",
  });

  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: ["Reiniciar ahora", "Más tarde"],
    defaultId: 0,
    cancelId: 1,
    title: "Actualización lista",
    message: "Hay una nueva versión del launcher lista para instalar.",
    detail: info && info.version ? "Versión " + info.version : undefined,
  });

  if (response === 0) await instalarAhora();
}

function enlazarAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    enviarALogin({ estado: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    enviarALogin({
      estado: "available",
      version: info && info.version ? info.version : "",
    });
  });

  autoUpdater.on("update-not-available", () => {
    enviarALogin({ estado: "not-available" });
  });

  autoUpdater.on("download-progress", (progreso) => {
    enviarALogin({
      estado: "progress",
      porcentaje: Math.round(progreso.percent || 0),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    actualizacionLista = true;
    avisoActualizacionLista(info).catch(() => {});
  });

  autoUpdater.on("error", (err) => {
    const texto =
      err && err.message
        ? err.message
        : "No se pudo comprobar actualizaciones.";
    enviarALogin({ estado: "error", error: texto });
  });
}

function comprobar() {
  return autoUpdater.checkForUpdates().catch(() => {});
}

function initActualizaciones(opciones) {
  if (!app.isPackaged) return;

  if (opciones && typeof opciones.hayVentanasJuego === "function") {
    hayVentanasJuego = opciones.hayVentanasJuego;
  }

  enlazarAutoUpdater();

  if (!ipcListo) {
    ipcListo = true;
    ipcMain.handle("actualizacion-reiniciar", async () => {
      if (!actualizacionLista) {
        return { ok: false, error: "Aún no hay actualización descargada." };
      }
      if (hayVentanasJuego()) {
        return {
          ok: false,
          error: "Cierra las ventanas del juego antes de actualizar.",
        };
      }
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    });

    ipcMain.handle("actualizacion-comprobar", async () => {
      try {
        await comprobar();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message || "Error al comprobar." };
      }
    });
  }

  setTimeout(() => comprobar(), RETRASO_INICIO_MS);
}

module.exports = { initActualizaciones };
