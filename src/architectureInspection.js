const { mapConcurrent } = require("./concurrency");

async function inspectAssignments(client, assignments, concurrency) {
  return mapConcurrent(assignments, concurrency, (assignment) =>
    inspectAssignment(client, assignment),
  );
}

async function inspectAssignment(client, assignment) {
  try {
    const result = await client.inspectFile(assignment.filePath);
    return { filePath: assignment.filePath, report: result.data };
  } catch (error) {
    return {
      filePath: assignment.filePath,
      error: error.message || String(error),
    };
  }
}

module.exports = { inspectAssignments };
