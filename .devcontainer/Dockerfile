# Ghost MCP Server Development Container
FROM node:24-bookworm

# Build arguments
ARG TZ=America/Los_Angeles
ARG GIT_DELTA_VERSION=0.18.2
ARG STARSHIP_VERSION=1.21.1

# Set timezone
ENV TZ=${TZ}

# Install development tools and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Essential tools
    git \
    curl \
    wget \
    ca-certificates \
    gnupg \
    # Shell and terminal tools
    zsh \
    fzf \
    vim \
    nano \
    less \
    # Utilities
    jq \
    unzip \
    # Native build dependencies for sharp
    libvips-dev \
    build-essential \
    python3 \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install git-delta for better diffs (detect architecture)
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" \
    -o /tmp/git-delta.deb \
    && dpkg -i /tmp/git-delta.deb \
    && rm /tmp/git-delta.deb

# Install Starship prompt
RUN curl -fsSL https://starship.rs/install.sh | sh -s -- --yes

# Configure npm global packages directory
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=${NPM_CONFIG_PREFIX}/bin:${PATH}

# Create directories and set permissions
RUN mkdir -p ${NPM_CONFIG_PREFIX} \
    && chown -R node:node ${NPM_CONFIG_PREFIX}

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Persist bash/zsh history
RUN mkdir -p /commandhistory \
    && touch /commandhistory/.bash_history \
    && touch /commandhistory/.zsh_history \
    && chown -R node:node /commandhistory

# Create Claude config directory
RUN mkdir -p /home/node/.claude \
    && chown -R node:node /home/node/.claude

# Configure zsh for the node user with Starship
RUN echo 'export HISTFILE=/commandhistory/.zsh_history' >> /home/node/.zshrc \
    && echo 'export HISTSIZE=10000' >> /home/node/.zshrc \
    && echo 'export SAVEHIST=10000' >> /home/node/.zshrc \
    && echo 'setopt SHARE_HISTORY' >> /home/node/.zshrc \
    && echo 'setopt HIST_IGNORE_DUPS' >> /home/node/.zshrc \
    && echo '[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ] && source /usr/share/doc/fzf/examples/key-bindings.zsh' >> /home/node/.zshrc \
    && echo '[ -f /usr/share/doc/fzf/examples/completion.zsh ] && source /usr/share/doc/fzf/examples/completion.zsh' >> /home/node/.zshrc \
    && echo 'eval "$(starship init zsh)"' >> /home/node/.zshrc \
    && chown node:node /home/node/.zshrc

# Configure bash with Starship
RUN echo 'export HISTFILE=/commandhistory/.bash_history' >> /home/node/.bashrc \
    && echo 'export HISTSIZE=10000' >> /home/node/.bashrc \
    && echo 'export HISTFILESIZE=20000' >> /home/node/.bashrc \
    && echo 'shopt -s histappend' >> /home/node/.bashrc \
    && echo 'eval "$(starship init bash)"' >> /home/node/.bashrc \
    && chown node:node /home/node/.bashrc

# Set up git delta as the default diff pager
RUN git config --system core.pager delta \
    && git config --system interactive.diffFilter 'delta --color-only' \
    && git config --system delta.navigate true \
    && git config --system delta.light false \
    && git config --system merge.conflictstyle diff3

# Environment variables
ENV SHELL=/usr/bin/zsh \
    EDITOR=nano \
    VISUAL=nano \
    CLAUDE_CONFIG_DIR=/home/node/.claude \
    DEVCONTAINER=true

# Set workspace directory
WORKDIR /workspace

# Switch to node user
USER node

# Default command
CMD ["zsh"]
