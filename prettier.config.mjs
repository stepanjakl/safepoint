/** @type {import("prettier").Config} */
const config = {
  singleQuote: true,
  plugins: ['prettier-plugin-tailwindcss'],
  overrides: [
    // A token is a name and two colours. At 80 it wrapped across four lines,
    // which is most of why the role block ran to 940.
    { files: '*.css', options: { printWidth: 100 } },
  ],
};

export default config;
