# Unlucid Gem Manager

A modern, high-performance dashboard for managing multiple Unlucid accounts, tracking gems, and automating claims. Built with React, Vite, and Tailwind CSS.

## Features

- **Multi-Account Dashboard**: View all your accounts in a sleek, responsive grid or masonry layout.
- **Real-time Stats**: Track total gems and ready-to-claim status instantly.
- **Auto-Claim**: Claim gems for individual accounts or all eligible accounts with one click.
- **Drawing Cursor**: Enjoy a smooth, interactive emerald trail effect as you navigate.
- **Dark/Light Mode**: Fully supported themes with a premium glassmorphism aesthetic.
- **Secure**: Your tokens are stored locally in your configuration file.

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

1.  **Set up your secrets:**
    Rename `constants.example.ts` to `constants.ts`:
    ```bash
    mv constants.example.ts constants.ts
    ```

2.  **Add your cookies:**
    Open `constants.ts` and add your account details.
    > **Important:** `constants.ts` is git-ignored to protect your sensitive data. Never commit your real tokens.

    ```typescript
    export const DEFAULT_COOKIES: RawCookiesJson = {
      "my_account": {
        "gmail": "user@gmail.com",
        "__Secure-authjs.callback-url": "...",
        "__Secure-authjs.session-token": "..."
      }
    };
    ```

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
