# Create fonts directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "public/fonts"

# Download Noto Sans font files
$fontUrls = @{
    "NotoSans-Bold.ttf" = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf"
    "NotoSans-Italic.ttf" = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Italic.ttf"
    "NotoSans-BoldItalic.ttf" = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-BoldItalic.ttf"
}

foreach ($font in $fontUrls.GetEnumerator()) {
    Write-Host "Downloading $($font.Key)..."
    Invoke-WebRequest -Uri $font.Value -OutFile "public/fonts/$($font.Key)"
    Write-Host "Downloaded $($font.Key)"
}

Write-Host "All font files downloaded successfully!" 