export default {
  extends: ["stylelint-config-standard"],
  rules: {
    // Ordered feature overrides are intentional; source order is part of the CSS contract.
    "no-descending-specificity": null,
    "selector-class-pattern": "^[a-z][a-z0-9-]*$",
  },
};
