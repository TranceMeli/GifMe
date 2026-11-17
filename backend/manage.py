#!/usr/bin/env python
"""Django command-line entry point."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line
    from django.core.management.commands.runserver import Command as RunserverCommand

    # An uncommon default port keeps clear of other local Django projects on 8000.
    RunserverCommand.default_port = "8190"

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
