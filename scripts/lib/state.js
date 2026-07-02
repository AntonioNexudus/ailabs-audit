// Mutable runtime state shared across modules. CommonJS captures values, not
// bindings, so a `let` reassigned in one module is invisible to others — these
// two flags live on a single exported object every module reads and writes.
//
// selectedBusinessIds: Set<string> of the businesses being audited, or null for
//   "all". Set once in main() after validation; read by the fetch layer
//   (scopedPlan), the data accessors, and check #16.
// fetchClear: true when the CLI is returning clear (un-tokenized) PII because
//   the operator unlocked pii-mode. Detected once in main() before any fetch.
module.exports = {
  selectedBusinessIds: null,
  fetchClear: false,
};
