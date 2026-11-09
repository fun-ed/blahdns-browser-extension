const colorScheme = matchMedia("(prefers-color-scheme: dark)");
let selectedTheme = "system";

function applyTheme() {
  document.documentElement.dataset.theme =
    selectedTheme === "system"
      ? colorScheme.matches
        ? "dark"
        : "light"
      : selectedTheme;
}

colorScheme.addEventListener("change", applyTheme);
applyTheme();

export function setTheme(theme) {
  selectedTheme = theme === "light" || theme === "dark" ? theme : "system";
  applyTheme();
}
