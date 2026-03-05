// Configuração mínima do ESLint no novo formato (v9+)
/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "lib/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
    },
    rules: {
      // Sem regras específicas por enquanto; apenas habilita o lint básico
    },
  },
];
