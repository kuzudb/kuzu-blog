const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const API_KEY = process.env.API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;
const youtube = google.youtube('v3');

const params = {
  key: API_KEY,
  channelId: CHANNEL_ID,
  order: 'date',
  part: 'snippet',
  maxResults: 5,
};

const outputPath = path.join(__dirname, '..', 'src', 'config', 'youtube.json');

youtube.search.list(params, (err, res) => {
  if (err) {
    console.error('Error when making request:', err);
    return;
  }

  const videos = res.data.items;

  const videoData = videos.map((video) => ({
    title: video.snippet.title,
    description: video.snippet.description,
    channelId: video.snippet.channelId,
    channelTitle: video.snippet.channelTitle,
    videoId: video.id.videoId,
    thumbnails: video.snippet.thumbnails,
    publishedAt: video.snippet.publishedAt,
  }));

  fs.writeFile(outputPath, JSON.stringify(videoData, null, 2), (err) => {
    if (err) {
      console.error('Error saving data to file:', err);
    } else {
      console.log('The data has been saved in youtube.json');
    }
  });
});
