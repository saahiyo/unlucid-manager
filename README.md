# Unlucid Gem Manager

A modern, high-performance dashboard for managing multiple Unlucid accounts, tracking gems, and automating claims. Built with React, Vite, and Tailwind CSS.

## Features

- **Multi-Account Dashboard**: View all your accounts in a sleek, responsive grid or masonry layout.
- **Real-time Stats**: Track total gems and ready-to-claim status instantly.
- **Auto-Claim**: Claim gems for individual accounts or all eligible accounts with one click.
- **Drawing Cursor**: Enjoy a smooth, interactive emerald trail effect as you navigate.
- **Dark/Light Mode**: Fully supported themes with a premium glassmorphism aesthetic.
- **Secure**: Your tokens are stored locally in your configuration file.

A modern, high-performance dashboard for managing multiple Unlucid accounts, tracking gems, and automating claims. Built with React, Vite, and Tailwind CSS.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/saahiyo/unlucid-manager.git
    cd unlucid-manager
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

1.  **Environment Variables:**
    This project uses Environment Variables to manage secrets. You do not need a `constants.ts` file.

    **Locally:**
    Create a `.env` file in the root directory:
    ```bash
    cp .env.example .env
    ```
    Open `.env` and paste your cookies JSON string into `VITE_COOKIES`.

    **On Vercel:**
    Go to your project settings > Environment Variables.
    Add a new variable:
    - **Key**: `VITE_COOKIES`
    - **Value**: Your full cookies JSON string (e.g., `{"my_account": {...}}`).

    > **Note:** The JSON string must be valid. You can minify it to a single line.

## Usage

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Technologies

- [React](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide React](https://lucide.dev/)
- [Framer Motion](https://www.framer.com/motion/) (conceptually, custom implementation)

## License

MIT
