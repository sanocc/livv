# POAI 正式品牌资产

唯一源图：poai-logo.png，1983×793 RGBA，SHA-256：5817bef2e5077428bf5a646cbd8e9020809886d17a6767d1a40f0be6ad06e2a6。原图保持不变，不重绘、不换色、不增加标语，也不生成近似SVG。

poai-icon.png仅保留左侧完整PO∞，沿源图与A之间透明间隙裁切，居中置于透明方形，安全区约4.5%。icon-16/32/48/128.png与favicon-16/32/48.png由同一图标Lanczos等比例缩放，favicon.ico包含16/32/48三种尺寸。源图和派生PNG四角Alpha均0；字体内部空白保持透明。

scripts/generate-brand.py记录确定性裁切与尺寸生成步骤，需要Pillow；正常构建不依赖Python。scripts/prepare-assets.mjs只复制已提交资产至四站public和Agent，生成当前版本ZIP。所有站点使用同一完整PNG，favicon与扩展使用PO∞。Logo元素不添加CSS底色、圆角或内边距，源图比例不变。

旧占位SVG及带旧占位图标的历史下载包已从当前发布目录移除；历史代码保留在Git。Agent资产发布版本1.3.5，权限和采集脚本均未变化；Windows可覆盖原目录后原位重新加载，勿卸载或清空身份。
