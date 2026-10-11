export function indexConversationBoundaries(nodes) {
  const nextBoundary = new Int32Array(nodes.length);
  nextBoundary.fill(-1);
  let boundary = -1;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    nextBoundary[index] = boundary;
    const node = nodes[index];
    if (
      node.kind === "summary" ||
      (node.kind === "message" && node.item?.role === "user")
    )
      boundary = index;
  }
  return nextBoundary;
}
