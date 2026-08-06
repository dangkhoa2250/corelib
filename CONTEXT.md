# Corelib

Corelib is a personal application platform that hosts a user-selected set of capabilities for everyday use.

## Language

**Corelib**:
The host platform that installs, runs, and coordinates the user's selected Plugins.
_Avoid_: Library app, document manager

**Core Service**:
A non-removable Corelib capability required to install, isolate, coordinate, secure, diagnose, or recover Plugins.
_Avoid_: Built-in Plugin, user feature

**Core Sync**:
An optional Core Service that synchronizes eligible Plugin Data across a user's devices while preserving Plugin ownership and local-first operation.
_Avoid_: Plugin cloud, mandatory account storage

**Corelib Home**:
The Core Service destination from which users discover and launch installed Plugins and recently used capabilities without permanently placing every Plugin Surface in navigation.
_Avoid_: Plugin Marketplace, dashboard plugin

**First-party Plugin**:
A removable Plugin published and supported by the Corelib project rather than a Core Service.
_Avoid_: Core feature, bundled module

**Library**:
A Plugin for collecting, importing, and reading documents.
_Avoid_: Corelib app, host platform

**Memora**:
A Plugin for creating flashcards and supporting durable learning through review.
_Avoid_: Corelib learning mode, built-in flashcards

**Windows Edition**:
The Windows-distributed edition of Corelib. It is the same product as other desktop editions, with platform-appropriate behavior rather than a separate feature fork.
_Avoid_: Windows rewrite, separate Windows app

**Plugin**:
An independently distributed unit that adds a coherent capability to Corelib and can be installed or removed by a user.
_Avoid_: Uploaded feature, add-on module

**Plugin Marketplace**:
The catalog through which users discover, install, update, and remove Plugins for Corelib.
_Avoid_: Plugin store, extension list

**Plugin Publisher**:
A person or organization that submits Plugin versions to the Plugin Marketplace for review and distribution.
_Avoid_: Uploader, vendor

**Plugin Release**:
An immutable, signed version of a Plugin that has been approved for distribution through the Plugin Marketplace.
_Avoid_: Plugin build, mutable version

**Plugin Runtime**:
The isolated Corelib environment that executes a Plugin's web UI and background logic while exposing only granted Plugin Capabilities.
_Avoid_: Native runtime, host WebView

**Plugin Manifest**:
The versioned declarative contract describing a Plugin's identity, compatibility, Plugin Dependencies, Plugin Permissions, Plugin Commands, Plugin Events, Plugin Resources, Plugin Surfaces, and other contributions.
_Avoid_: Package metadata, plugin configuration

**Plugin Registry**:
The Core Service index of available Plugins and their validated contributions, used by Corelib to discover and coordinate enabled capabilities.
_Avoid_: Marketplace catalog, command list

**Plugin Command**:
A stable, machine-readable operation exposed by a Plugin for invocation through Corelib by an authorized Command Audience.
_Avoid_: Tool function, plugin action

**Command Audience**:
A declared class of caller allowed to discover and request a Plugin Command, such as a human, another Plugin, the Agent Runtime, or an Automation.
_Avoid_: Permission, command copy

**Agent Runtime**:
The Corelib capability that discovers and coordinates Plugin Commands for AI-assisted work while preserving user permissions and control.
_Avoid_: AI Plugin, chatbot

**Agent Grant**:
A user-controlled grant allowing the Agent Runtime to invoke an agent-enabled Plugin Command within existing Plugin Permissions.
_Avoid_: Plugin Permission, AI access

**Agent Plan**:
An ordered, inspectable set of Plugin Command invocations proposed by the Agent Runtime to achieve a user's stated outcome.
_Avoid_: Prompt, hidden chain of actions

**Automation**:
A user-saved Agent workflow that may run from an approved schedule or Plugin Event within fixed commands, scopes, and resource limits.
_Avoid_: Background agent, autonomous task

**Plugin Capability**:
A permission-scoped Corelib service through which a Plugin accesses host data, operating-system features, or external resources.
_Avoid_: Native access, unrestricted API

**Plugin Permission**:
A user-controlled grant allowing one Plugin to use a specific Plugin Capability within an explicit scope.
_Avoid_: Capability, system permission

**Plugin Dependency**:
A version-constrained relationship in which one Plugin requires another Plugin or optionally enhances itself when that Plugin is available.
_Avoid_: Direct import, implicit integration

**Plugin Surface**:
A user-facing destination contributed by a Plugin and hosted within Corelib's navigation and visual frame.
_Avoid_: Plugin app, embedded page

**Plugin Data**:
User data owned exclusively by one Plugin and kept within that Plugin's isolated storage namespace.
_Avoid_: Shared app data, plugin files

**Plugin Reference**:
A durable, loosely coupled reference from one Plugin's data to a resource owned by another Plugin, which may temporarily be unresolved.
_Avoid_: Cross-plugin foreign key, direct database link

**Plugin Resource**:
A versioned, JSON-Schema-defined representation of Plugin-owned state that the Plugin makes available across its boundary.
_Avoid_: Database row, plugin state file

**Plugin Event**:
A versioned, JSON-Schema-defined notice that something relevant changed or occurred in a Plugin, normally identifying a Plugin Resource and its revision rather than duplicating its complete state.
_Avoid_: State snapshot, direct callback

**Disable**:
Stop a Plugin from running or contributing to Corelib while retaining its installed package and Plugin Data.
_Avoid_: Deactivate, turn off

**Uninstall**:
Remove a Plugin's installed package while retaining its Plugin Data for possible reinstallation.
_Avoid_: Delete plugin, remove data

**Erase Plugin Data**:
Permanently remove the retained Plugin Data for an installed or uninstalled Plugin through a separate confirmed operation.
_Avoid_: Uninstall, clear plugin
