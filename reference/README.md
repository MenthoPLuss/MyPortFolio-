Put the reference screen recording here as `IMG_1302.mov`, then extract frames with:

    ffmpeg -i reference/IMG_1302.mov -vf fps=4,scale=1280:-1 reference/frames/f_%03d.jpg

(`reference/frames/` is git-ignored.)
