import React from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";

interface CoolieLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * Coolie 官方品牌 Logo 组件。
 *
 * 统一渲染位于 clients/expo/assets/logo.png 的 512x512 高清品牌曲别针图标。
 * 适配 AppBar 顶栏、登录英雄区、大盘页眉及各类需要品牌标识的场景。
 */
export function CoolieLogo({ size = 24, style }: CoolieLogoProps) {
  return (
    <Image
      source={require("../../assets/logo.png")}
      style={[{ width: size, height: size, resizeMode: "contain" }, style]}
      accessibilityRole="image"
      accessibilityLabel="Coolie Logo"
    />
  );
}
