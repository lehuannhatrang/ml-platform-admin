#! /bin/bash
echo "Build images in progress..."

cp -r ./ui/apps/dashboard/dist/ _output/bin/linux/amd64/

make build

DOCKER_FILE=build-web.Dockerfile make images

echo "Done"