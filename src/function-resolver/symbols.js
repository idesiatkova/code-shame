const nodeId = (node) => `${node.type}:${node.start}:${node.end}`;

function symbol(data, node, file) {
  const found = data.symbols.find((item) => item.id === nodeId(node));
  return found ? { file, hash: data.hash, ...found } : null;
}
function property(node) {
  if (!node.computed && node.property?.type === "Identifier") return node.property.name;
  if (node.computed && node.property?.type === "StringLiteral") return node.property.value;
  if (!node.computed && node.property?.type === "PrivateName") return `#${node.property.id.name}`;
  return null;
}

module.exports = { symbol, property };
