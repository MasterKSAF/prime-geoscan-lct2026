---
title: "Building using Containers | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/getting_started/container.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "4c323d912c91ea713792ec1bf42402cd79b5f2ff52be1dbb24a385dee30281c9"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Building using Containers | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/getting_started/container.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="building-using-containers"></a>

# Building using Containers

The community created a docker image that makes it much easier to build a Linux-based QGC application. This can give you a massive boost in productivity and help with testing.

<a id="about-the-container"></a>

## About the Container

The Container is located in the `./deploy/docker` directory. It's based on **Ubuntu 24.04**. However, always check the first lines of the Dockerfile in the aforementioned directory to have zero surprises.

It checks and pre-installs all the dependencies at build time, including Qt, thanks to the use of scripts from the directory `./tools/setup`. The main advantage of using the container is the usage of the `CMake` build system and its many improvements over `qmake`.

<a id="building-the-container"></a>

## Building the Container

<a id="script"></a>

### Script

To build the container using the script, run this command in the qgc root directory

sh

```text
./deploy/docker/run-docker.sh ubuntu
```

<a id="manual"></a>

### Manual

if you want to Build using the container manually, then you first have to build the image. You can accomplish this using docker, running the following script from the root of the QGC source code directory.

sh

```text
docker build --target linux --file ./deploy/docker/Dockerfile -t qgc-ubuntu-docker .
```

INFO

The `-t` flag is essential. Keep in mind this is tagging the image for later reference since you can have multiple builds of the same container

INFO

If building on a Mac computer with an M1 chip you must also specify the build option `--platform linux/x86_64` as shown:

sh

```text
docker build --platform linux/x86_64 --target linux --file ./deploy/docker/Dockerfile -t qgc-ubuntu-docker .
```

Otherwise you will get a build error like:

sh

```text
qemu-x86_64: Could not open '/lib64/ld-linux-x86-64.so.2': No such file or directory
```

<a id="building-qgc-using-the-container"></a>

## Building QGC using the Container

To use the container to build QGC, you first need to define a directory to save the artifacts. We recommend you create a `build` directory on the source tree and then run the docker image using the tag provided above as follows, from the root directory:

sh

```text
mkdir build
docker run --rm -v ${PWD}:/project/source -v ${PWD}/build:/project/build qgc-ubuntu-docker
```

INFO

For up to date docker commands and options, reference the run scripts in [`deploy/docker`](https://github.com/mavlink/qgroundcontrol/tree/master/deploy/docker).

INFO

If using the script to build the Linux image on a Windows host, you would need to reference the PWD differently. On Windows the docker command is:

sh

```text
docker run --rm -v %cd%:/project/source -v %cd%/build:/project/build qgc-ubuntu-docker
```

Depending on your system resources, or the resources assigned to your Docker Daemon, the build step can take some time.

<a id="troubleshooting"></a>

## Troubleshooting

<a id="windows-bash-r-no-such-file-or-directory"></a>

### Windows: 'bash\\r': No such file or directory

This error indicates that a Linux script is being run with Windows line endings, which might occur if `git` was configured to use Windows line endings:

sh

```text
 > [4/7] RUN /tmp/qt/install-qt-linux.sh:
#9 0.445 /usr/bin/env: 'bash\r': No such file or directory
```

One fix is to force Linux line endings using the command:

sh

```text
git config --global core.autocrlf false
```

Then update/recreate your local repository. For, example, use:

sh

```text
git rm --cached -r .
git reset --hard
```
