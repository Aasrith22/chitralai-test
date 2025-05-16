# Chitralai - Your Photo Management Solution

## Overview
Pixigo is a modern web application that helps users organize, store, and share photos with ease. It features AI-powered face recognition capabilities, secure AWS S3 storage integration, and an intuitive user interface.

## Features
- **Image Upload**: Easily upload multiple images with drag-and-drop support
- **Face Recognition**: Advanced face matching capabilities using AWS Rekognition
- **Secure Storage**: Images securely stored in AWS S3
- **QR Code Integration**: Quick access to selfie upload functionality
- **Responsive Design**: Modern UI that works across all devices

## Tech Stack
- React with TypeScript
- Tailwind CSS for styling
- AWS Services (S3, Rekognition)
- Vite for build tooling

## Prerequisites
- AWS Account with S3 and Rekognition access
- Environment variables configuration

## Setup
1. Clone the repository:
```bash
git clone <repository-url>
cd fotosnm
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Create a `.env` file in the root directory with the following variables:
```env
VITE_AWS_ACCESS_KEY_ID=your_access_key_id
VITE_AWS_SECRET_ACCESS_KEY=your_secret_access_key
```

4. Start the development server:
```bash
npm run dev
```

## AWS Configuration
1. Create an S3 bucket for storing images
2. Enable CORS on the S3 bucket
3. Configure AWS Rekognition access
4. Set up IAM user with appropriate permissions

## Usage
### Uploading Images
1. Navigate to the upload page
2. Drag and drop images or click to select
3. Click the upload button
4. Scan the QR code or use the link to upload a selfie

### Face Recognition
1. Upload a selfie
2. The system will automatically match it with previously uploaded images
3. View matched images in the gallery

## Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License
MIT

## Support
For support, please open an issue in the GitHub repository.
