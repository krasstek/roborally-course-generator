// Robo Rally Course Randomizer - About dialog
import { closeVariantPicker } from "./controls.js";

export function openAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  if (!dialog?.showModal || dialog.open) {
    return;
  }
  closeVariantPicker();
  dialog.showModal();
}

export function closeAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  if (!dialog?.open) {
    return;
  }
  dialog.close();
}
