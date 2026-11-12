export const appearanceStorage = {
  theme: "internos-ui:theme",
  transparency: "internos-ui:reduce-transparency",
};
export const appearanceBootScript = `try{var t=localStorage.getItem('${appearanceStorage.theme}');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system';document.documentElement.dataset.transparency=localStorage.getItem('${appearanceStorage.transparency}')==='true'?'reduced':'full'}catch{}`;
