import styles from "./loading.module.css";

export default function ReaderLoading() {
  return (
    <div className={styles.container}>
      {/* Sakura petal spinner */}
      <svg
        className={styles.spinner}
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        {/* Top petal */}
        <path
          d="M24 4C24 4 28 13 28 17C28 21 24 24 24 24C24 24 20 21 20 17C20 13 24 4 24 4Z"
          fill="#f2a0b3"
          opacity="0.9"
        />
        {/* Right petal */}
        <path
          d="M44 24C44 24 35 28 31 28C27 28 24 24 24 24C24 24 27 20 31 20C35 20 44 24 44 24Z"
          fill="#f2a0b3"
          opacity="0.75"
        />
        {/* Bottom petal */}
        <path
          d="M24 44C24 44 20 35 20 31C20 27 24 24 24 24C24 24 28 27 28 31C28 35 24 44 24 44Z"
          fill="#f2a0b3"
          opacity="0.65"
        />
        {/* Left petal */}
        <path
          d="M4 24C4 24 13 20 17 20C21 20 24 24 24 24C24 24 21 28 17 28C13 28 4 24 4 24Z"
          fill="#f2a0b3"
          opacity="0.8"
        />
        {/* Center */}
        <circle cx="24" cy="24" r="4" fill="#e8a849" opacity="0.9" />
      </svg>

      <p className={styles.text}>Loading chapter...</p>
    </div>
  );
}
