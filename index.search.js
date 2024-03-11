var relearn_search_index = [
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "This book describes how I setup a Linux Workstation (on a personal Desktop or Laptop computer).\n",
    "description": "",
    "tags": null,
    "title": "Linux Workstation",
    "uri": "/linux-workstation/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "This book describes how to get started with self-hosting your own Docker server, using the tools provided by d.rymcg.tech.\n",
    "description": "",
    "tags": null,
    "title": "Self-hosting Docker with d.rymcg.tech",
    "uri": "/d.rymcg.tech/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "This book describes how to use OpenSSH, both as a client, and as a server.\n",
    "description": "",
    "tags": null,
    "title": "OpenSSH",
    "uri": "/openssh/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "This book describes how this site is written, in Org-mode, with ox-hugo, and bits of Literate Programming.\n",
    "description": "",
    "tags": null,
    "title": "Publishing with org-mode, ox-hugo, and literate programming.",
    "uri": "/publishing-with-org-mode/index.html"
  },
  {
    "breadcrumb": "",
    "content": "This repository contains a collection of books written by EnigmaCurry.\nThis content is open-source, CC BY 4.0. See LICENSE for attribution rules.\nTable of contents In HTML form, the menu bar on the left contains the table of contents, and shows the book titles as top level headings, and chapter headings beneath it. On smaller screens, you may need to expand this menu using the top left hamburger menu.\nWhen viewing any chapter, the section sub-headings can be shown on a per-chapter basis, via the Table of Contents button at the top left.\nNavigation The entire site is presented as a book of books, so you can read through them all, simply by navigating through to the next page, until you get to the end. Use your keyboard arrow keys, left and right, to flip backwards and forwards through the pages. If you are using a touch screen interface, use the arrow buttons at the top right of the page instead.\nSearch Use the search box in the left hand menu to search all of the books on the site.\n",
    "description": "",
    "tags": null,
    "title": "book.rymcg.tech",
    "uri": "/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "What is self-hosting? Self-hosting is described on Wikipedia as the following:\nSelf-hosting is the practice of running and maintaining a website or service using a private web server, instead of using a service outside of someone’s own control. Self-hosting allows users to have more control over their data, privacy, and computing infrastructure, as well as potentially saving costs and improving skills.\nYou can apply self-hosting a little bit, or a lot. On the one hand, you could post all of your content on Facebook (obviously, this is not self-hosting), and on the other hand you could build all your servers yourself, from parts, and run them in your basement, on your own network, bootstrapping everything. For most people though, self-hosting means to use cloud computing, using a generic Linux VPS (virtual private server), installing and operating open-source software (or software that you built), but still letting the cloud provider handle the hardware and network side of things.\nDemarcate your own level of abstraction. Test that your abstraction works in a generic way, portable to any other provider at the same level of abstraction. Try running it entirely at home, at least for development purposes. Don’t get locked into a single vendor. Use open source software, or software you built yourself. This is self-hosting.\nWhat is Docker? Docker is a software platform for running containers on Linux. Containers let you install and run software in an isolated and generic way. It solves the problems of “dependency hell” and “But it works on my computer!”, for all Linux distributions. Containers are created from images that include all of their dependencies, including the operating system to support it. The only thing a container does not include, is the Linux kernel, which is shared from the host with all the containers running on the same host. This abstraction makes it work the same way on all computers, regardless of Linux distribution (assuming an up to date kernel). Docker maintains persistent volumes for each container, so that they may mount it into their own virtual filesystem, and thus storing all of its important data into the volume. You may upgrade, or even delete these containers, and as long as you keep the volume(s), you can simply reprovision the same images (even on new hardware), and the containers will load all of its same data from before.\nWhat is a container? Although it is possible to run desktop software inside of a Docker container, 99% of the time a Docker container is created to run a service, assumed to run on a server, assumed to be serving remote clients. Generally, a container is designed only to run a single service. For example: A web server, a chat server, a DNS server, a python server you write, etc. Multiple instances of the same image can run as separate containers, and they can even share volumes, if you want (though generally not).\nContainers are related to a different technology that you might already be familar with: Virtual Machines. However, there are several fundamental differences between containers and virtual machines, and so it is useful to describe them here as a comparison:\nFeature Container Virtual Machine Kernel Containers share a kernel with the host VMs runs their own kernel Hardware Containers share hardware with the host, but with the addition of a permissions model to access it VMs use hardware virtualization features Memory Containers share memory with the host VMs use a fixed size virtual hardware memory space Disk Containers share storage system with the host (volumes live under /var/lib/docker/ by default) VMs use a fixed size (but expandable) virtual hard disk image Network Containers support Host level networking, or can do NAT NAT or bridge network, not host level Execution model Containers are just a regular Linux processes, run under a given user account VMs run their own kernel and init (systemd) Init process Containers don’t need an init process, Docker runs the containers process (CMD) directly VMs run their own kernel and init (systemd) Process isolation Containers run as as regular Linux processes, which have a capabilities system to limit privileges VMs are like a separate machine, and a have a separate process space Root filesystem Containers inherit a root filesystem from their image, which contain all the application files, and the OS, minus a kernel VMs are run from (linked) virtual disk images Volumes Containers automatically mount volumes provided from Docker. Docker maintains the lifecycle of these volumes. VMs can have multiple virtual disks, or manually mount remote volumes Containerization uses features of the Linux kernel, (specifically, namespaces and cgroups). For the purposes of this book, the term “container” will always imply that it is running on a Linux host; it is inseparable from the host kernel, and it can’t work without it! (You may be aware that you can install a product called “Docker Desktop” on Windows or MacOS. This product installs a Linux virtual machine on your host OS and runs Docker inside it, and then it installs the docker client on the host OS, so it appears seamless.)\nIn a general context, there are other OS containers, like Windows containers, however they are on the fringe, and will not be discussed in this book. Containers imply Linux.\nDocker is a good platform to pick for self-hosting containers, because it’s a mature open source project, and it works on virtually any Linux computer or VPS. Docker is server focussed, and therefore ideal for self-hosting. Docker is easy to get started with, even if you’re a beginner.\nWhat is Docker Compose? Docker uses a client-server API pattern of control. You install the Docker daemon on a server machine, and this machine is called the Docker Host. Usually you interact with the API through the command line docker tool. Docker provides primitive commands for running single containers directly, with docker run. However, for larger projects that need more than one container (eg. a webserver + a database) and need to be able to talk to one another, docker run is not the best tool to use.\ndocker compose is a command that operates your containers from a project level abstraction. docker compose lets you define all the containers and volumes that you need for a given project, in a declarative way, in a docker-compose.yaml file.\nWith docker compose you can start/stop/delete all the project containers together, as a single unit.\nWhat is d.rymcg.tech? d.rymcg.tech is a collection of docker compose projects for various open source server applications, with an integrated frontend proxy with Traefik Proxy, including integrated authentication (HTTP Basic and/or OAuth2) and IP address filtering, and is a framework for packaging your own applications, and managing several container instances at the same time, with seprate configs in .env files.\nd.rymcg.tech focuses on the config rules of the 12-factor principle. All of the configuration for a container should be specified as environment variables, which Docker loads from a standard .env file. All of the data for a container should live inside a Docker Volume (not a bind mount), and so the lifecycle of the volume is maintained by Docker directly.\nd.rymcg.tech is designed to work on a workstation, not a server. The Docker client-server API is accessed remotely over SSH. Only your personal workstation should be used to issue docker commands that affect the server, they should not be run on the server itself. It’s important to keep the server as bare bones and hands off as possible. The server’s only job is to run containers, configured from a remote workstation. Once the server is setup, you won’t normally need to even login to the server console ever again. By controlling the server from your workstation, you can manage the server in a clean fashion. You can even create a new server from scratch, in no time. All of the important configuration stays on your workstation (and are backed up in a git repository).\n",
    "description": "",
    "tags": null,
    "title": "Introduction",
    "uri": "/d.rymcg.tech/introduction/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Linux Workstation",
    "content": "A Linux Workstation is a single user computer that you use as your primary interface for computing, especially for “work” purposes. At a bare minimum, a workstation includes a keyboard to type on, and a display to display things on. Historically, there has been a hardware distinction between a personal computer (PC) and a Unix workstation, but ever since the introduction of Linux, the difference in hardware doesn’t really exist anymore, and any computing device can become a workstation. The only important distinctions for a workstation is the role that it serves, and how you configure and use it on daily basis.\nThe role of a workstation is very different than that of a server. A workstation’s only purpose is to serve you, the user, while interacting with its physical keyboard/mouse/etc interface. A workstation is usually connected to a network, but only as a client, not as a server. (Of course, you may bend this rule if you like, to make your computer a server-workstation or “Sworkstation”, but it is cleaner, and more secure, to use separate machines for these very differnt roles.)\nThis book will describe my preferred method for setting up a brand new computer for use as a personal workstation.\n",
    "description": "",
    "tags": null,
    "title": "Introduction",
    "uri": "/linux-workstation/introduction/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e OpenSSH",
    "content": "SSH (secure shell) is a secure networking tool used between a client and a server. Using an encrypted network protocol, it can be used to securely login to a server remotely, as well as for more advanded networking scenarios. Typical use cases for SSH include:\nAccess a server’s terminal console, remotely. Transfer files between the server and client (using rsync, scp, or sftp). Create network tunnels to access private servers, in both directions, either on the server, or on the client. Create a server that acts as a bastion or “jump” host, to be a port of entry into a larger private network. SSH is configured to only allow authorized client keys access through the bastion host. Create a server to act as an HTTP (socks) client proxy, to allow remote clients to browse the web, using the server’s IP address as the origin. SSH is based upon public key cryptography. Both the client and the server need to create their own public/private keypair. Keys can be encrypted on disk (eg. ~/.ssh/id_ecdsa) or they may also be loaded from a USB hardware token. Upon connecting to a remote server for the first time, the client asks the user to validate the server’s public key fingerprint, and then the server’s public key is written into a file called ~/.ssh/known_hosts, which marks the connection as trusted from then on. The server also authorizes the client through a predefined authorized_keys file. If either side rejects the key presented by the other, the connection is unauthorized, and is closed immediately.\nSSH is a protocol that has become standardized, and there are various implementations, however the most venerable example is still OpenSSH, and this is the only implementation that this book will cover. If you want to use an SSH client from a different vendor, just make sure that is supports the SSH v2 protocol.\nOpenSSH has legacy support for passwords that you type via the keyboard. This is as an older alternative to SSH keys. It is still enabled by default in many distributions. The instructions in this book will entirely disable these interactive passwords. Clients wishing to gain entry to your server will be forced to provide a valid SSH key credentials, and no keyboard passwords are allowed!\n",
    "description": "",
    "tags": null,
    "title": "Introduction",
    "uri": "/openssh/introduction/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Publishing with org-mode, ox-hugo, and literate programming.",
    "content": "intro\n",
    "description": "",
    "tags": null,
    "title": "Introduction",
    "uri": "/publishing-with-org-mode/introduction/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Publishing with org-mode, ox-hugo, and literate programming.",
    "content": "This site is built with:\nEmacs Org-mode Ox-hugo Hugo (extended edition) GitHub actions (also compatible with Gitea actions) The GitHub/Gitea actions file includes all its dependencies declaratively.\nTo build locally, you must install Emacs (29+), and hugo (v0.120+), using your package manager, or by downloading directly from their respective project pages. Please be aware that hugo has two editions: standard and extended, and this build requires the extended edition (TODO: verify this - I had some problems before - but maybe they are resolved - I am still using the extended edition for now).\nYou will also need to clone the source to your workstation:\ngit clone https://github.com/EnigmaCurry/org.git ~/git/vendor/enigmacurry/orgI always recommend to everyone, that you choose to use the ~/git/vendor/ORG_NAME/REPO_NAME path structure when cloning any git repository (including your own!). This suggested path is a vendor-neutral convention, useful for documentation purposes, and which shouldn’t conflict with any existing directory you might have. Therefore the instructions should generally work on all machines. If we all agree to use the same path, the instructions are much easier to write, and read from! If you are adamant about cloning this elsewhere, consider making a symlink from this path anyway (In this case, ~/git/vendor/enigmacurry/org).\n",
    "description": "",
    "tags": null,
    "title": "Dependencies",
    "uri": "/publishing-with-org-mode/dependencies/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Linux Workstation",
    "content": "I have tried a great many different Linux distributions over the years, but I have recently settled on using Fedora Sway Atomic for my desktop and laptop workstations.\nSway is a minimal tiling window manager for Wayland. It is ideal for efficient keyboard centric development and for getting out of your way.\nThe “Atomic” part refers to rpm-ostree which was developed by the CoreOS team to build an operating system that is built entirely to support containers. The root file system of the host operating system is mounted read-only, and the packages are distributed in an image, rather than installed individually. This makes updating (or rolling back) the system far easier, and makes for a more stable environment. There is no need to replace packages one-by-one, you just download the new image provided by the distro, and then reboot the system to use it.\nThe base image includes all the typical things everyone needs: coreutils, a display manager, web browser, terminal apps etc. However, the base image is still pretty bare bones. Furthermore, the image is read-only, so you can’t install packages like you can with a more traditional Linux distro. If you want to install something that isn’t in the base image, you have a few different options:\nPodman or Docker containers. Since containers use their own image, they are separate from the main image, and can be freely created and destroyed separately. Flatpak is a type of application container that includes all of its dependencies, and it is sandboxed/isolated from the host system, therefore they can be installed/managed separately from the base image. Use rpm-ostree itself to create a new image layer. This extends the base layer with extra packages you want to install. This is fully supported, but not optimal, as when you upgrade the base image, this layer needs to be recreated each time. I only use a couple of Flatpak apps for a few things. For almost everything else I use Podman containers via toolbox and/or distrobox and these can even include graphical applications. Creating your own rpm-ostree layers is to be avoided if possible, but some things don’t like running in containers, so this remains an option.\n",
    "description": "",
    "tags": null,
    "title": "Fedora Sway Atomic",
    "uri": "/linux-workstation/fedora-sway-atomic/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e OpenSSH",
    "content": "",
    "description": "",
    "tags": null,
    "title": "Install SSH server",
    "uri": "/openssh/install-ssh-server/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "To host a web service, one of the first things you will need is to register your domain name. This will be the domain name used for all your service links, and it is what your users will need to type into their browsers to visit your pages.\nDomain names a scarce resource. Because of their scarcity, you must pay for your domain registrations, doing so in 1 year increments. If domains were free, all the good ones would be taken by now, but because they cost money, there are still some good enough ones left to be had. In return for your fee, you receive exclusive use of your domain name for the period that you paid for. You can pre-pay for several years in advance, or for just one year at a time. You must remember to renew your domains for every year, lest they expire and no longer resolve to your services, and you lose control of the domain, possibly forever.\nDomain names for private servers If your Docker server won’t be a public server, (eg. running a private Docker server at home), it is still recommended that you use a valid internet domain name, because you will still need one in order to create valid TLS certificates from Let’s Encrypt. However, having working TLS is not required for development purposes (but certainly nice to have!), so you may choose to make up your own fake domain name instead, and forgo TLS. In either case, you will still need to setup DNS, and this is explained in the next section.\nRegister an Internet domain name You can buy (rent) a domain name from lots of places. For documentation purposes, we will use Gandi.net, but these instructions will be similar regardless of the domain provider you pick.\nSign up for an account at Gandi.net Once signed in, from your dashboard, click Register. Search for any domain name you like, eg. your-name.com. Add your domain to the shopping cart, go to checkout, and complete your purchase. Once you have purchased the domain, it should show up in your Dashboard, under the Domain tab. Leave this browser tab open, you will return to it in the next chapter. ",
    "description": "",
    "tags": null,
    "title": "Register a domain name",
    "uri": "/d.rymcg.tech/register-a-domain-name/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Publishing with org-mode, ox-hugo, and literate programming.",
    "content": "Change into the directory where you cloned the source:\ncd ~/git/vendor/enigmacurry/orgRun the install method to download the theme:\n# This just downloads/installs the theme: make installBuild the site:\n# This builds the entire static site into the public/ directory: make buildRun the development server:\n# This builds the entire site, and then runs the live reload server: make serve",
    "description": "",
    "tags": null,
    "title": "Building locally",
    "uri": "/publishing-with-org-mode/building-locally/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e OpenSSH",
    "content": "",
    "description": "",
    "tags": null,
    "title": "Install SSH client",
    "uri": "/openssh/install-ssh-client/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Linux Workstation",
    "content": "You will need the following hardware:\nAn x86_64 desktop or laptop computer. A USB drive for copying the .iso installer to. A solokey or other FIDO2 compatible hardware authentication key. (This is optional, but highly recommended for storing secure shell keys, PGP keys, and logging into websites with Webauthn.) ",
    "description": "",
    "tags": null,
    "title": "Requirements",
    "uri": "/linux-workstation/requirements/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "A DNS server maps your domain (and subdomain) names to the various IP addresses of your servers. DNS is required for your users to be able to type your domain name prod.example.com and have it resolve to the IP address that is required to contact your Docker server.\nNow that you have registered a domain name, you need to tell your registrar where your DNS server is. Usually you will use the DNS server that your cloud provider gives you, but you may choose any DNS provider you like. If you are creating a private server, you may still want to choose a public DNS server, but using private IP addresses ranges for the records. You can also setup a local/private DNS server, but this will be discussed later.\nFor documentation purposes, this chapter will assume you are using Gandi.net as your domain registrar, and that you want to use DigitalOcean.com as your domain’s public DNS server, but these instructions will be similar regardless of the providers you pick.\nConfigure your domain’s DNS server on Gandi.net Login to your gandi.net dashboard. Click the Domain tab. Find your domain name in the list and click on it. Click on the Nameservers tab. Click on the edit button to create new External nameservers. Delete all existing nameservers that may exist. Add the following nameservers, specific to DigitalOcean: ns1.digitalocean.com ns2.digitalocean.com ns3.digitalocean.com Once changed, you can verify the setting from your workstation, using the whois command:\nwhois your-domain.comThe output shows a report for your domain registration, including the list of the new nameservers.\nSetup public DNS on DigitalOcean.com Signup for an account at DigitalOcean, if you haven’t already. Login to the cloud console. Click on the Networking tab in the menu. Click on the Domains tab. Enter your domain name into the box and click Add Domain. DigitalOcean is now in charge of your DNS for your domain. You will return to this screen later on, when creating individual subdomain records for your services.\n",
    "description": "",
    "tags": null,
    "title": "Setup public DNS",
    "uri": "/d.rymcg.tech/setup-dns/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "The next three chapters will guide you to install Docker, for three different server scenarios:\nA production/staging Docker server on the public Internet (eg. DigitalOcean or any other VPS cloud provider). A production/staging Docker server on a private LAN. A development Docker server in a local VM. ",
    "description": "",
    "tags": null,
    "title": "Create a Docker server",
    "uri": "/d.rymcg.tech/docker-server/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e OpenSSH",
    "content": "When setting up a new user on a workstation, you should create a new (client) SSH key. In other words, don’t share your SSH private key on two machines: create two separate keys instead. That way, if one machine becomes lost or stolen, you only have to remove the one key from your authorized keys lists.\nIf you have a hardware token that stores your SSH key, like the solokey, you can ignore the advice about creating separate keys per machine, and simply unplug and replug your token between machines.\nChoosing the SSH key type It is recommended to use the newer ecdsa or ed25519 key types, which uses the latest encryption standards. Your distribution may still use the older standard rsa by default, so you should explicitly select the type when creating the key.\nHowever, some older servers don’t accpet ecdsa or ed25519 keys, and so in those cases you should create an rsa key.\nCreate the new SSH keys Create the rsa key type:\nssh-keygen -t rsa -f ~/.ssh/id_rsaCreate the ecdsa key type:\nssh-keygen -t ecdsa -f ~/.ssh/id_ecdsaCreate the ed25519 key type:\nssh-keygen -t ed25519 -f ~/.ssh/id_ed25519You will be prompted to enter a passphrase, to encrypt the keyfile, which you should definitely not skip!\nSetup the ssh-agent Because you encrypted your keyfile, you need to enter the passphrase everytime you use it. This is inconvenient, so you can run ssh-agent to temporarily store your key in memory, and therefore you only need to enter your passphrase once, when you log in.\nInstall the keychain program:\n# On Debian / Ubuntu machines: sudo apt install keychain # On Arch Linux machines: sudo pacman -S keychain # On Fedora: sudo dnf install keychainTo configure keychain, edit your ~/.bashrc file:\n# Put this line in your ~/.bashrc: eval $(keychain --eval --quiet)Log out of your desktop session, and log back in. Open your terminal, and you should be automatically prompted to enter your SSH passphrase. Once you have entered the passphrase, the SSH key will remain resident in memory until you log out.\nDouble check that the key has been loaded, run:\nssh-add -LThe above should print your public key, loaded into the running ssh-agent. Now you should be able to use your key without entering a passphrase. Copy the output and upload it to your services as your authorized key. For servers, put the key into ~/.ssh/authorized_keys. For hosted services, like GitHub, paste the key into your SSH settings page.\n",
    "description": "",
    "tags": null,
    "title": "Create new SSH key(s) on a new client workstation",
    "uri": "/openssh/client-keys/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Linux Workstation",
    "content": "Download the Fedora Sway Atomic iso image.\nAssuming you are temporarily using another Linux workstation, write the .iso image to a USB drive (eg. replace /dev/sdX with your device name):\ndd if=Fedora-Sericea-ostree-x86_64-39-1.5-respin2.iso \\ of=/dev/sdX bs=10M status=progress conv=syncBoot the target workstation computer using the USB drive. You will boot into the Anaconda install wizard. Just follow the prompts to install it, it is exactly the same as any other Fedora / Redhat install.\nTips:\nEnable whole disk encryption and choose a secure passphrase. Especially for laptop computers that you may travel with, this an important thing to do to keep your files safe at rest. Use the entire disk for the install. Dual booting another operating system on the same workstation is not considered a safe/secure thing to do. If you want to run Windows or play games, use a separate computer for that. Once the installer finishes, reboot, remove the USB, and login to your new system.\nSetup Sway The Fedora Atomic Sway edition includes a default configuration for Sway. It’s pretty nice out of the box, and so if you like it you can just use it. However, I have my own custom configuration that I replace it with, and you can do the same if you like.\nOpen the default terminal emulator (foot) with the keyboard shortcut: Win+Enter (hold down the “Windows” key on your keyboard, then press Enter.)\nMy custom config replaces several of the default configuration files. So you must first get rid of these files, by renaming them with the suffix .orig for posterity:\nmv ~/.config ~/.config.orig mv ~/.bashrc ~/.bashrc.orig mv ~/.bash_profile ~/.bash_profile.origNext, install my customized sway config repository :\ngit clone https://github.com/enigmacurry/sway-home \\ ~/git/vendor/enigmacurry/sway-home cd ~/git/vendor/enigmacurry/sway-home ./setup.shThe setup.sh script links the repository files to the same original paths as the files you just moved. It also asks you some questions to help setup your git profile.\nOnce you have finished entering the information setup asks for, press Win+Shift+E, and choose Log Out. Log back in, and this will load the new config files.\n",
    "description": "",
    "tags": null,
    "title": "Installation",
    "uri": "/linux-workstation/install/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "This section will guide you to create your own public Docker server as a DigitalOcean droplet, however you may also install Docker on any cloud provider or dedicated host that you prefer.\nChoosing a VPS provider One of the most basic units of cloud computing is the Virtual Private Server (VPS). A VPS is a virtual machine that is provisioned by a cloud service, that you are given full adminstrative control of. You are given root access to the VPS (running Linux), and you can install whatever you want. VPS generally come with a dedicated IP address and have a public internet connection, although some VPS only have NAT, with dedicated port forwarding.\nIn this guide you will create a VPS with a DigitalOcean droplet.\nYou can install Docker on almost any VPS, but some are better than others. DigitalOcean is a good choice for experimenting, because it is billed hourly, and because it has an integrated external firewall. Having an external firewall is one of the most important features to look for in a hosting provider. Docker maintains its own firewall on the host level automatically, and so your hands should probably stay off of it. If you want to reliably block traffic, in addition to the automatic rules, it must be done on an external/upstream firewall.\nCreate a DigitalOcean account and setup your SSH key If you have not yet setup an SSH key on your workstation, read the OpenSSH book and do that first.\nSignup for an account at DigitalOcean. Login to the DigitalOcean cloud console. Click Settings in the menu. Click on the Security tab. Click on the Add SSH Key button. Paste your public SSH key into the box. (copy your pub key from the output of ssh-add -L.) Enter a key name, I recommend this be the name of your workstation computer. Finish adding the key, click Add SSH Key. Create a DigitalOcean firewall template Login to the DigitalOcean cloud console. Click Networking in the menu. Click the Firewalls tab. Click Create Firewall. Enter the name, eg. basic-docker-public-web. Enter the following rules: SSH: Type: SSH Protocol: TCP Port Range: 22 Sources: All IPv4, All IPv6, or a specific static IP address if you want to be more secure. HTTP: Type: HTTP Protocol: TCP Port Range: 80 Sources: All IPv4, All IPv6. HTTPS: Type: HTTP Protocol: TCP Port Range: 443 Sources: All IPv4, All IPv6. Click Create Firewall. Creating a DigitalOcean droplet for a Docker server DigitalOcean provides a Docker image with which to create a droplet (DigitalOcean’s name for their own VPS product).\nLogin to the DigitalOcean cloud console. Click Droplets in the menu. Click Create Droplet. Choose a Region (eg. New York), where the droplet will be created. Underneath the heading Choose an image, select the Marketplace tab. Find the image called Docker 2x.x.x (eg. 23.0.6 or a later version) Choose a droplet size. 2GB RAM and 50GB disk recommended for medium size production installs. (It is tested working on as little as 512MB ram, if you enable zram and/or create a 1GB swapfile. Do not abuse swap space like this in production! However I think its fine for development use, but you may occasionally run into low memory issues if less than 1GB.) Optional: Add a block storage device, in order to store your Docker volumes. (This is useful to store data separate from the droplet lifecycle, or to have a larger amount of storage than the droplet size gives you for the root filesystem. If your basic droplet size is already sufficient, and you perform regular backups, this might not be needed.) Select your SSH key for the root user. Set the hostname for the docker server. The name should be short and typeable, as it will become a part of the canononical service URLs. For this example, we choose prod. Verify everything’s correct, and then click Create Dropet. Apply the DigitalOcean droplet firewall Login to the DigitalOcean cloud console. Click Networking in the menu. Find the firewall template you created, and click it. Click on the firewall’s Droplets tab. Click Add Droplets and search for the droplet you created and select it. Click Add Droplet to add the firewall to the droplet. Create wildcard DNS records for the droplet For the purposes of documentation, assume you you own the domain example.com and you have created the Docker server named prod. You should replace example.com with your actual domain name, and prod with your actual docker instance name/stage.\nLogin to the DigitalOcean cloud console. Click Networking in the menu. Click the Domains tab. Find the domain you created earlier, and click it. Create an A record: Hostname: enter the subdomain name without the domain part (eg. prod, the name of your docker server, without the .example.com suffix). Will direct to: select the droplet you created from the list. Click Create Record. Create another A record, for the wildcard: Hostname: enter the same name as before but prepend *. in front of it (eg. if the server is named prod, create a record for *.prod, without the .example.com suffix). Will direct to: select the same droplet as before. Click Create Record. Optional: create additional records on the root domain. If you don’t want the docker instance name in the subdomain you give to people (eg. www.prod.example.com), you could create additional (non-wildcard) records on the root domain now (eg. www.example.com, or even just example.com). However, it would be wasteful to put a wildcard record on the root domain (*.example.com) because then the domain could only be used with a single Docker instance, therefore all records on the root should be non-wildcard, and this means you must add them one by one. Test that your wildcard record actually works. Use the dig command (For Debian/Ubuntu install the dnsutils package. For Arch Linux install bind-tools. For Fedora install bind-utils.)\nPick some random subdomain off your domain:\ndig laksdflkweieri.prod.example.comSince you created the wildcard record for *.prod.example.com dig should return your Docker server’s IP address in the ANSWER SECTION of the output. You can test all your other records the same way.\nIf you run into DNS caching problems, verify with the source DNS server directly:\ndig @ns1.digitalocean.com laksdflkweieri.prod.example.comSetup your local workstation Edit your SSH config file: ~/.ssh/config (create it if necessary). Add the following lines, and change it for your domain name that you already created the DNS record for:\nHost ssh.prod.example.com User root ControlMaster auto ControlPersist yes ControlPath /tmp/ssh-%u-%r@%h:%p(The name ssh.prod.example.com should work automatically if you setup the wildcard DNS entry (*.prod.example.com) created previously. The ControlMaster, ControlPersist, ControlPath adds SSH connection multi-plexing, and will make repeated logins/docker commands faster.)\nNow test that you can SSH to your droplet:\nssh ssh.prod.example.com\nThe first time you login to your droplet, you need to confirm the SSH pubkey fingerprint; press Enter. Once connected, log out: press Ctrl-D or type exit and press Enter.\n",
    "description": "",
    "tags": null,
    "title": "Create a public Docker server",
    "uri": "/d.rymcg.tech/public-docker-server/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "Create a VM\nSetup private DNS If you chose a fake domain, you can set the DNS record on your local DNS server. Generally, most LANs already have a local DNS server install on a home router. You can add your records there. If you don’t have a DNS server, you can install dnsmasq. dnsmasq can act as DNS and/or DHCP servers for your LAN.\nA dnsmasq entry for the wildcard records would look like this (in dnsmasq.conf):\n# dnsmasq wildcard records for your Docker server (192.168.0.1): address=/prod.example.com/192.168.0.1 address=/.prod.example.com/192.168.0.1Replace 192.168.0.1 with the ip of your Docker server.\nAlternatively, you can edit /etc/hosts directly on your workstation, but it does not support wildcard records, so you would have to specify each name one by one:\n## /etc/hosts excerpt for three explicit domains: 192.168.0.1 prod.example.com www.prod.example.com test.prod.example.com",
    "description": "",
    "tags": null,
    "title": "Create a private Docker Server for a LAN",
    "uri": "/d.rymcg.tech/private-docker-server/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech \u003e Self-hosting Docker with d.rymcg.tech",
    "content": "",
    "description": "",
    "tags": null,
    "title": "Create a development Docker Server VM",
    "uri": "/d.rymcg.tech/development-docker-server-vm/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "book.rymcg.tech is © 2023 EnigmaCurry.\nExcept as listed below, all books and other files in this domain and/or git repository are licensed: Creative Commons Attribution 4.0. You can reference this repository like this, or by any other content equivalent custom formatting:\nbook.rymcg.tech is © 2023 EnigmaCurry used by permission CC BY 4.0See the full CC BY license at http://creativecommons.org/licenses/by/4.0\nExceptions The compiled/rendered HTML site uses hugo-theme-relearn which is distributed under the MIT license:\nThe MIT License (MIT) Copyright (c) 2021 Sören Weber Copyright (c) 2017 Valere JEANTET Copyright (c) 2016 MATHIEU CORNIC Copyright (c) 2014 Grav Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.",
    "description": "",
    "tags": null,
    "title": "LICENSE",
    "uri": "/license/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "",
    "description": "",
    "tags": null,
    "title": "Categories",
    "uri": "/categories/index.html"
  },
  {
    "breadcrumb": "book.rymcg.tech",
    "content": "",
    "description": "",
    "tags": null,
    "title": "Tags",
    "uri": "/tags/index.html"
  }
]
