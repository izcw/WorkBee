"use client";

function detectPlatform() {
  if (typeof navigator === "undefined") return { name: "电脑", icon: "/icon/windows.png" };
  const value = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (value.includes("mac")) return { name: "macOS", icon: "/icon/apple.png" };
  if (value.includes("linux")) return { name: "Linux", icon: "/icon/linux.png" };
  return { name: "Windows", icon: "/icon/windows.png" };
}

export function DownloadButton() {
  const platform = detectPlatform();

  return <a className="button primary detected-download" href="#download">
    <img src={platform.icon} alt="" />
    <span>下载 {platform.name} 版</span>
  </a>;
}
