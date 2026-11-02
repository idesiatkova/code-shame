export const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
export const button = (text, action) => {
  const node = element("button", "secondary-button", text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};
