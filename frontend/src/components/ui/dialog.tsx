import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

interface DialogProps {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

const DialogContext = React.createContext<{
    open?: boolean
    onOpenChange?: (open: boolean) => void
}>({})

const Dialog = ({ children, open, onOpenChange }: DialogProps) => {
    return (
        <DialogContext.Provider value={{ open, onOpenChange }}>
            {children}
        </DialogContext.Provider>
    )
}

const DialogTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => {
    const { onOpenChange } = React.useContext(DialogContext)
    
    if (asChild) {
        return React.cloneElement(children as React.ReactElement<any>, {
            onClick: () => onOpenChange?.(true)
        })
    }
    
    return (
        <div onClick={() => onOpenChange?.(true)}>
            {children}
        </div>
    )
}

const DialogContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    const { open, onOpenChange } = React.useContext(DialogContext)

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop — visual only; close via X / Cancel / Footer buttons only */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                aria-hidden="true"
            />
            {/* Content */}
            <div
                role="dialog"
                aria-modal="true"
                className={cn(
                    "relative z-[101] w-full max-w-lg bg-white dark:bg-gray-900 rounded-lg shadow-xl animate-in zoom-in-95 fade-in duration-200 p-6",
                    className,
                )}
            >
                <button
                    type="button"
                    aria-label="Close"
                    onClick={() => onOpenChange?.(false)}
                    className="absolute right-4 top-4 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
                {children}
            </div>
        </div>
    )
}

const DialogHeader = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)}>
        {children}
    </div>
)

const DialogFooter = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6", className)}>
        {children}
    </div>
)

const DialogTitle = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)}>
        {children}
    </h2>
)

const DialogDescription = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <p className={cn("text-sm text-gray-500 dark:text-gray-400", className)}>
        {children}
    </p>
)

export {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
}
