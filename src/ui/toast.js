// Robo Rally Course Randomizer - toast notifications
export function showToast(message) {
  const stack = document.getElementById("toast-stack");
  if (!stack || !message) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  stack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => {
      toast.remove();
    }, 220);
  }, 2600);
}
