'use strict';

const { app, ipcMain } = require('electron');
const { aplicarSwitchesChromium } = require('./js/config');
const { leerPrefs, registrarIpcPrefs } = require('./js/prefs');
const {
  ventanasJuego,
  crearVentana,
  enfocarOCrearLogin,
  registrarIpcVentanas,
} = require('./js/ventanas');
const { registrarIpcMenuCuentas } = require('./js/menu-cuentas');
const { limpiarMacroAlSalir, registrarIpcMacro } = require('./js/macro-astros');
const { initActualizaciones } = require('./js/updater');

aplicarSwitchesChromium();

registrarIpcPrefs();
registrarIpcVentanas();
registrarIpcMenuCuentas();
registrarIpcMacro();
ipcMain.handle('app-version', () => app.getVersion());

const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    enfocarOCrearLogin();
  });

  app.whenReady().then(() => {
    leerPrefs();
    crearVentana();
    initActualizaciones({
      hayVentanasJuego: () => ventanasJuego.length > 0,
    });
  });
}

app.on('before-quit', () => {
  limpiarMacroAlSalir();
});

app.on('window-all-closed', () => app.quit());
