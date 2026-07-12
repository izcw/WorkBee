"use client";

import { useEffect, useState } from "react";

export function DownloadButton() {
  const [platform, setPlatform] = useState({ name: "电脑", icon: "/icon/windows.png" });

  useEffect(() => {
    const value = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (value.includes("mac")) setPlatform({ name: "macOS", icon: "/icon/apple.png" });
    else if (value.includes("linux")) setPlatform({ name: "Linux", icon: "/icon/linux.png" });
    else setPlatform({ name: "Windows", icon: "/icon/windows.png" });
  }, []);

  return <a className="button primary detected-download" href="#download">
    <img src={platform.icon} alt="" />
    <span>下载 {platform.name} 版</span>
  </a>;
}
